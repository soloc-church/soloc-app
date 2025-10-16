// supabase/functions/stream-channels/index.ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js';
import { StreamChat } from 'npm:stream-chat';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to return JSON responses
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

// Extract route path
function getRoutePath(url: URL): string {
  const match = url.pathname.match(/\/stream-channels(\/.*)?$/);
  return match?.[1] || '/';
}

// Initialize clients and verify auth
async function initializeClients(req: Request) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  );

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw jsonResponse({ error: 'No authorization header' }, 401);
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const stream = StreamChat.getInstance(
    Deno.env.get('STREAM_API_KEY')!,
    Deno.env.get('STREAM_API_SECRET')!
  );

  return { supabase, stream, userId: user.id };
}

// Helper to ensure group channel exists
async function ensureGroupChannel(
  supabase: any,
  stream: StreamChat,
  groupChatId: string
) {
  const { data: group, error } = await supabase
    .from('group_chats')
    .select('id, name, description, stream_channel_id, created_by, visibility')
    .eq('id', groupChatId)
    .single();

  if (error || !group) {
    throw jsonResponse({ error: 'Group not found' }, 404);
  }

  const channel = stream.channel('team', group.id, {
    name: group.name,
    description: group.description,
    visibility: group.visibility,
    created_by: group.created_by,
  });

  try {
    await channel.create();
  } catch (err) {
    // Channel already exists, which is fine
  }

  const cid = channel.cid ?? `${channel.type}:${group.id}`;

  // Update DB with channel ID if not set
  if (!group.stream_channel_id) {
    await supabase
      .from('group_chats')
      .update({ stream_channel_id: cid })
      .eq('id', group.id);
  }

  return { channel, group, cid };
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    const path = getRoutePath(url);
    const { supabase, stream, userId } = await initializeClients(req);
    
    // Parse body for non-GET requests
    const body = req.method !== 'GET' ? await req.json().catch(() => ({})) : {};

    // Route: POST /dm - Create or get DM channel
    if (req.method === 'POST' && path === '/dm') {
      const { otherUserId } = body;
      if (!otherUserId) {
        return jsonResponse({ error: 'otherUserId required' }, 400);
      }

      // Create deterministic DM channel ID
      const members = [userId, otherUserId].sort();
      const dmId = `dm_${members[0]}_${members[1]}`;
      
      const channel = stream.channel('messaging', dmId, {
        members,
      });

      try {
        await channel.create();
      } catch {
        // Channel already exists
      }

      const cid = channel.cid ?? `${channel.type}:${dmId}`;

      // Store in database
      await supabase
        .from('direct_message_channels')
        .upsert(
          {
            user1_id: members[0],
            user2_id: members[1],
            stream_channel_id: cid,
          },
          { onConflict: 'user1_id,user2_id' }
        );

      return jsonResponse({ cid });
    }

    // Route: POST /create-group - Create new group
    if (req.method === 'POST' && path === '/create-group') {
      const { name, description, visibility, memberIds, image } = body;
      
      if (!name || !visibility) {
        return jsonResponse({ error: 'name and visibility are required' }, 400);
      }

      // Create group in database
      const { data: group, error: createError } = await supabase
        .from('group_chats')
        .insert({
          name,
          description,
          visibility,
          created_by: userId,
        })
        .select()
        .single();

      if (createError) {
        return jsonResponse({ error: 'Failed to create group' }, 500);
      }

      // Create Stream channel
      const channel = stream.channel('team', group.id, {
        name,
        description,
        visibility,
        image,
        created_by: userId,
      });

      const allMembers = [...(memberIds || []), userId];
      await channel.create();
      await channel.addMembers(allMembers);

      const cid = channel.cid ?? `${channel.type}:${group.id}`;

      // Update group with channel ID
      await supabase
        .from('group_chats')
        .update({ stream_channel_id: cid })
        .eq('id', group.id);

      return jsonResponse({ id: group.id, cid });
    }

    // Route: POST /ensure-group - Ensure group channel exists
    if (req.method === 'POST' && path === '/ensure-group') {
      const { groupChatId } = body;
      if (!groupChatId) {
        return jsonResponse({ error: 'groupChatId required' }, 400);
      }

      const { cid } = await ensureGroupChannel(supabase, stream, groupChatId);
      return jsonResponse({ cid });
    }

    // Route: POST /join-group - Join a group
    if (req.method === 'POST' && path === '/join-group') {
      const { groupChatId } = body;
      if (!groupChatId) {
        return jsonResponse({ error: 'groupChatId required' }, 400);
      }

      const { channel } = await ensureGroupChannel(supabase, stream, groupChatId);
      await channel.addMembers([userId]);
      
      return jsonResponse({ ok: true });
    }

    // Route: POST /leave-group - Leave a group
    if (req.method === 'POST' && path === '/leave-group') {
      const { groupChatId } = body;
      if (!groupChatId) {
        return jsonResponse({ error: 'groupChatId required' }, 400);
      }

      const { channel } = await ensureGroupChannel(supabase, stream, groupChatId);
      await channel.removeMembers([userId]);
      
      return jsonResponse({ ok: true });
    }

    // Route: PATCH /update-group - Update group details
    if (req.method === 'PATCH' && path === '/update-group') {
      const { groupChatId, name, description } = body;
      if (!groupChatId) {
        return jsonResponse({ error: 'groupChatId required' }, 400);
      }

      const { channel, group } = await ensureGroupChannel(supabase, stream, groupChatId);

      // Check permissions
      const { data: profile } = await supabase
        .from('profiles')
        .select('global_role')
        .eq('id', userId)
        .single();

      const isAdmin = ['admin', 'pastor', 'elder'].includes(profile?.global_role);
      const isCreator = group.created_by === userId;

      if (!isAdmin && !isCreator) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }

      // Update Stream channel
      const updates: any = {};
      if (name) updates.name = name;
      if (description) updates.description = description;

      if (Object.keys(updates).length > 0) {
        await channel.update(updates);
        
        // Update database
        await supabase
          .from('group_chats')
          .update(updates)
          .eq('id', groupChatId);
      }

      return jsonResponse({ ok: true });
    }

    // Route: DELETE /delete-group - Delete a group
    if (req.method === 'DELETE' && path === '/delete-group') {
      const { groupChatId } = body;
      if (!groupChatId) {
        return jsonResponse({ error: 'groupChatId required' }, 400);
      }

      const { data: group } = await supabase
        .from('group_chats')
        .select('id, created_by')
        .eq('id', groupChatId)
        .single();

      if (!group) {
        return jsonResponse({ error: 'Group not found' }, 404);
      }

      // Check permissions
      const { data: profile } = await supabase
        .from('profiles')
        .select('global_role')
        .eq('id', userId)
        .single();

      const isAdmin = ['admin', 'pastor', 'elder'].includes(profile?.global_role);
      const isCreator = group.created_by === userId;

      if (!isAdmin && !isCreator) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }

      // Delete Stream channel
      const channel = stream.channel('team', group.id);
      try {
        await channel.delete();
      } catch {
        // Channel might not exist
      }

      // Soft delete in database
      await supabase
        .from('group_chats')
        .update({ 
          stream_channel_id: null,
          deleted_at: new Date().toISOString()
        })
        .eq('id', group.id);

      return jsonResponse({ ok: true });
    }

    // Route: POST /add-members - Add members to group
    if (req.method === 'POST' && path === '/add-members') {
      const { groupChatId, memberIds } = body;
      if (!groupChatId || !memberIds || !Array.isArray(memberIds)) {
        return jsonResponse({ error: 'groupChatId and memberIds array required' }, 400);
      }

      const { channel } = await ensureGroupChannel(supabase, stream, groupChatId);
      await channel.addMembers(memberIds);
      
      return jsonResponse({ ok: true });
    }

    // Route: POST /remove-members - Remove members from group
    if (req.method === 'POST' && path === '/remove-members') {
      const { groupChatId, memberIds } = body;
      if (!groupChatId || !memberIds || !Array.isArray(memberIds)) {
        return jsonResponse({ error: 'groupChatId and memberIds array required' }, 400);
      }

      const { channel } = await ensureGroupChannel(supabase, stream, groupChatId);
      await channel.removeMembers(memberIds);
      
      return jsonResponse({ ok: true });
    }

    // 404 for unmatched routes
    return jsonResponse({ error: 'Not found' }, 404);

  } catch (error) {
    // If error is already a Response, return it
    if (error instanceof Response) {
      return error;
    }

    console.error('Stream channels error:', error);
    return jsonResponse({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, 500);
  }
});
