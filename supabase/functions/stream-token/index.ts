// supabase/functions/stream-channels/index.ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js';
import { StreamChat } from 'npm:stream-chat';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS,PATCH,DELETE',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json (data: unknown, status=200) {
  const body = JSON.stringify(data);
  const options = {
    status,
    headers: {
      ...CORS_HEADERS,
      'content-type': 'application/json'
    }
  }
  return new Response(body, options);
}

function routePath(url: URL) {
  const m = url.pathname.match(/\/stream-channels(\/.*)?$/);
  return m?.[1] ?? '/';
}

type Json = Record<string, unknown>;

//auth
async function getUserAndClients(req: Request) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  );

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseJwt = authHeader.replace('Bearer ', '');

  const { data: { user }, error } = await supabase.auth.getUser(supabaseJwt);
  if (error || !user) throw json({ error: 'Unauthorized' }, 401);

  // Server-side Stream client uses API SECRET
  const stream = StreamChat.getInstance(
    Deno.env.get('STREAM_API_KEY')!,
    Deno.env.get('STREAM_API_SECRET')!
  );

  // Map to your Stream user id via Postgres function
  const { data: streamUserId, error: mapErr } = await supabase
    .rpc('get_or_create_stream_user', { p_user_id: user.id });
  if (mapErr || !streamUserId) return json({ error: mapErr?.message ?? 'Mapping failed' }, 500);

  await server.upsertUser({ id: String(streamUserId), name: user.email ?? user.id });
  const token = server.createToken(String(streamUserId));
  return json({ token, apiKey: Deno.env.get('STREAM_API_KEY'), streamUserId: String(streamUserId) });
}

// Ensure or create the Stream channel for a group row
async function ensureGroupChannel(supabase: any, stream: StreamChat, groupChatId: string) {
  const { data: group, error } = await supabase
    .from('group_chats')
    .select('id, name, stream_channel_id, created_by, visibility, parent_group_id, is_general_channel')
    .eq('id', groupChatId)
    .single();

  if (error || !group) throw json({ error: 'Group not found' }, 404);

  const type = 'team';
  // Deterministic id = group.id (so you can safely call create() multiple times)
  const channel = stream.channel(type, group.id, {
    name: group.name,
    visibility: group.visibility,
    parent_group_id: group.parent_group_id,
    is_general_channel: group.is_general_channel,
  });

  try {
    await channel.create(); // no-op if already exists (will throw; we ignore below)
  } catch {
    /* channel already exists */
  }

  const cid = channel.cid;

  if (!group.stream_channel_id) {
    await supabase.from('group_chats').update({ stream_channel_id: cid }).eq('id', group.id);
  }

  return { cid, channel, group };
}

//handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const url = new URL(req.url);
    const path = routePath(url);
    const { supabase, userId, stream, streamUserId } = await getUserAndClients(req);

    // Parse JSON body for non-GET
    const body: Json = req.method !== 'GET' ? await req.json().catch(() => ({})) : {};

    // 1) Ensure or create a group channel; returns cid
    if (req.method === 'POST' && path === '/ensure-group') {
      const groupChatId = String(body.groupChatId ?? '');
      if (!groupChatId) return json({ error: 'groupChatId required' }, 400);

      const { cid } = await ensureGroupChannel(supabase, stream, groupChatId);
      return json({ cid });
    }

    // 2) Join current user to a group channel
    if (req.method === 'POST' && path === '/join-group') {
      const groupChatId = String(body.groupChatId ?? '');
      if (!groupChatId) return json({ error: 'groupChatId required' }, 400);

      const { channel } = await ensureGroupChannel(supabase, stream, groupChatId);
      await channel.addMembers([streamUserId]);
      return json({ ok: true });
    }

    // 3) Leave current user from a group channel
    if (req.method === 'POST' && path === '/leave-group') {
      const groupChatId = String(body.groupChatId ?? '');
      if (!groupChatId) return json({ error: 'groupChatId required' }, 400);

      const { channel } = await ensureGroupChannel(supabase, stream, groupChatId);
      await channel.removeMembers([streamUserId]);
      return json({ ok: true });
    }

    // 4) Update channel (admin/elder/pastor or group creator)
    if (req.method === 'PATCH' && path === '/update-group') {
      const groupChatId = String(body.groupChatId ?? '');
      if (!groupChatId) return json({ error: 'groupChatId required' }, 400);

      const { group, channel } = await ensureGroupChannel(supabase, stream, groupChatId);

      // Check role/ownership
      const { data: profile } = await supabase
        .from('profiles')
        .select('global_role')
        .eq('id', userId)
        .single();

      const elevated = ['admin', 'pastor', 'elder'].includes(profile?.global_role || '');
      const isCreator = group.created_by === userId;
      if (!elevated && !isCreator) return json({ error: 'Forbidden' }, 403);

      const patch: Record<string, unknown> = {};
      if (body.name) patch.name = body.name;
      if (body.description) patch.description = body.description;

      if (Object.keys(patch).length > 0) {
        await channel.update(patch);
      }
      return json({ ok: true });
    }

    // 5) Delete channel (admin/elder/pastor or group creator)
    if (req.method === 'DELETE' && path === '/delete-group') {
      const groupChatId = String(body.groupChatId ?? '');
      if (!groupChatId) return json({ error: 'groupChatId required' }, 400);

      const { data: group } = await supabase
        .from('group_chats')
        .select('id, created_by')
        .eq('id', groupChatId)
        .single();

      if (!group) return json({ error: 'Group not found' }, 404);

      const { data: profile } = await supabase
        .from('profiles')
        .select('global_role')
        .eq('id', userId)
        .single();

      const elevated = ['admin', 'pastor', 'elder'].includes(profile?.global_role || '');
      const isCreator = group.created_by === userId;
      if (!elevated && !isCreator) return json({ error: 'Forbidden' }, 403);

      // Delete on Stream (ignore if already gone)
      const channel = stream.channel('team', group.id);
      try {
        await channel.delete();
      } catch {
        /* ignore */
      }

      await supabase
        .from('group_chats')
        .update({ stream_channel_id: null })
        .eq('id', group.id);

      return json({ ok: true });
    }

    // 6) Get-or-create a DM channel & persist it
    if (req.method === 'POST' && path === '/dm') {
      const otherUserId = String(body.otherUserId ?? '');
      if (!otherUserId) return json({ error: 'otherUserId required' }, 400);

      // Map both users to Stream ids
      const { data: otherStreamId, error: mapErr } = await supabase
        .rpc('get_or_create_stream_user', { p_user_id: otherUserId });

      if (mapErr || !otherStreamId) return json({ error: mapErr?.message ?? 'Mapping failed' }, 500);

      // Deterministic DM id
      const members = [String(otherStreamId), streamUserId].sort();
      const dmId = `dm_${members[0]}_${members[1]}`;
      const channel = stream.channel('messaging', dmId, { members });

      try {
        await channel.create();
      } catch {
        /* already exists */
      }

      // Persist to your DM table using raw (non-Stream) user ids
      const pair = [userId, otherUserId].sort();
      await supabase
        .from('direct_message_channels')
        .upsert(
          { user1_id: pair[0], user2_id: pair[1], stream_channel_id: channel.cid },
          { onConflict: 'user1_id,user2_id' }
        );

      return json({ cid: channel.cid });
    }

    // Fallthrough
    return json({ error: 'Not found' }, 404);
  } catch (e) {
    // If we threw a Response above, return it as-is
    if (e instanceof Response) return e;
    console.error(e);
    return json({ error: 'Server error' }, 500);
  }
});