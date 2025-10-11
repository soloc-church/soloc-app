// app/services/streamChatService.ts
// Stateless helpers for Stream Chat operations. Do NOT create or own the client here.
// In your React tree, create the client once and pass it in (or read from useChatContext()).

import type { StreamChat, Channel } from 'stream-chat';
import { supabase } from '../supabase';

const API_BASE = process.env.EXPO_PUBLIC_API_URL!; // e.g. https://<project>.functions.supabase.co

type TokenResponse = { token: string; streamUserId: string };

async function authHeader(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return `Bearer ${session.access_token}`;
}

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Request failed: ${res.status}`);
  return json as T;
}

/** Fetch a Stream user token for the current Supabase user. */
export async function fetchStreamToken(): Promise<TokenResponse> {
  const headers = new Headers({
    Authorization: await authHeader(),
    'Content-Type': 'application/json',
  });
  return api<TokenResponse>(`/stream-token`, { method: 'POST', headers });
}

/** Connect the current Supabase user to the provided Stream client. */
export async function connectCurrentUser(client: StreamChat): Promise<{ streamUserId: string }> {
  const { token, streamUserId } = await fetchStreamToken();
  // Connect without storing any module-level state.
  await client.connectUser({ id: streamUserId }, token);
  return { streamUserId };
}

/** Ensure a group chat channel exists and return it. */
export async function ensureGroup(client: StreamChat, groupChatId: string): Promise<Channel> {
  const headers = new Headers({
    Authorization: await authHeader(),
    'Content-Type': 'application/json',
  });
  const { cid } = await api<{ cid: string }>(`/stream-channels/ensure-group`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ groupChatId }),
  });
  const [type, id] = cid.split(':');
  const channel = client.channel(type as any, id);
  await channel.watch();
  return channel;
}

/** Start or fetch a 1:1 DM channel between the current user and otherUserId. */
export async function dm(client: StreamChat, otherUserId: string): Promise<Channel> {
  const headers = new Headers({
    Authorization: await authHeader(),
    'Content-Type': 'application/json',
  });
  const { cid } = await api<{ cid: string }>(`/stream-channels/dm`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ otherUserId }),
  });
  const [type, id] = cid.split(':');
  const channel = client.channel(type as any, id);
  await channel.watch();
  return channel;
}

export async function joinGroup(client: StreamChat, groupChatId: string): Promise<void> {
  const headers = new Headers({
    Authorization: await authHeader(),
    'Content-Type': 'application/json',
  });
  await api(`/stream-channels/join-group`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ groupChatId }),
  });
}

export async function leaveGroup(client: StreamChat, groupChatId: string): Promise<void> {
  const headers = new Headers({
    Authorization: await authHeader(),
    'Content-Type': 'application/json',
  });
  await api(`/stream-channels/leave-group`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ groupChatId }),
  });
}

export async function updateGroup(
  client: StreamChat,
  groupChatId: string,
  updates: Record<string, any>,
): Promise<void> {
  const headers = new Headers({
    Authorization: await authHeader(),
    'Content-Type': 'application/json',
  });
  await api(`/stream-channels/update-group`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ groupChatId, updates }),
  });
}

export async function deleteGroup(client: StreamChat, groupChatId: string): Promise<void> {
  const headers = new Headers({
    Authorization: await authHeader(),
    'Content-Type': 'application/json',
  });
  await api(`/stream-channels/delete-group`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ groupChatId }),
  });
}

// NOTE: We intentionally do not export any getters or state. These are *pure* helpers.
