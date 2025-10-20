// lib/stream/helpers.ts
import type { StreamChat, Channel, ChannelFilters, ChannelSort } from 'stream-chat';
import type { StreamApi } from './api';

/**
 * Open or create a DM channel with another user
 */
export async function openDMChannel(
  client: StreamChat,
  api: StreamApi,
  otherUserId: string
): Promise<Channel> {
  // Get the result object from the API
  //DEBUG
  console.log('[DEBUG][stream/helpers] openDMChannel start', {
    otherUserId,
  });
  const result = await api.dm(otherUserId);
  
  if (!result.ok) {
    throw new Error(result.error.message || 'Failed to create DM channel');
  }

  const { data } = result;
  const [type, id] = data.cid.split(':');
  //DEBUG
  console.log('[DEBUG][stream/helpers] openDMChannel cid parsed', {
    cid: data.cid,
    type,
    id,
    idLength: id?.length,
  });
  const channel = client.channel(type, id);
  await channel.watch();
  
  return channel;
}

/**
 * Ensure a group channel exists and watch it
 */
export async function ensureGroupChannel(
  client: StreamChat,
  api: StreamApi,
  groupChatId: string
): Promise<Channel> {
  //DEBUG
  console.log('[DEBUG][stream/helpers] ensureGroupChannel start', {
    groupChatId,
  });
  const result = await api.ensureGroup(groupChatId);
  
  if (!result.ok) {
    throw new Error(result.error.message || 'Failed to ensure group channel');
  }

  const { data } = result;
  const [type, id] = data.cid.split(':');
  //DEBUG
  console.log('[DEBUG][stream/helpers] ensureGroupChannel cid parsed', {
    cid: data.cid,
    type,
    id,
    idLength: id?.length,
  });
  const channel = client.channel(type, id);
  await channel.watch();
  
  return channel;
}

/**
 * Create a new group channel
 */
export async function createGroupChannel(
  client: StreamChat,
  api: StreamApi,
  params: {
    name: string;
    description?: string;
    visibility: 'public' | 'members' | 'private';
    memberIds: string[];
    image?: string;
  }
): Promise<Channel> {
  const result = await api.createGroup(params);
  
  if (!result.ok) {
    throw new Error(result.error.message || 'Failed to create group');
  }

  const { data } = result;
  const [type, id] = data.cid.split(':');
  const channel = client.channel(type, id);
  await channel.watch();
  
  return channel;
}

/**
 * Join a group channel
 */
export async function joinGroup(
  client: StreamChat,
  api: StreamApi,
  groupChatId: string
): Promise<void> {
  //DEBUG
  console.log('[DEBUG][stream/helpers] joinGroup start', {
    groupChatId,
  });
  const result = await api.joinGroup(groupChatId);
  
  if (!result.ok) {
    throw new Error(result.error.message || 'Failed to join group');
  }
  
  // After joining, ensure the channel is watched
  await ensureGroupChannel(client, api, groupChatId);
  //DEBUG
  console.log('[DEBUG][stream/helpers] joinGroup end', {
    groupChatId,
  });
}

/**
 * Leave a group channel
 */
export async function leaveGroup(
  client: StreamChat,
  api: StreamApi,
  groupChatId: string
): Promise<void> {
  const result = await api.leaveGroup(groupChatId);
  
  if (!result.ok) {
    throw new Error(result.error.message || 'Failed to leave group');
  }
  
  try {
    const channel = client.channel('team', groupChatId);
    await channel.stopWatching();
  } catch {
    // Channel might not be watched, ignore
  }
}

/**
 * Update group channel information
 */
export async function updateGroup(
  client: StreamChat,
  api: StreamApi,
  groupChatId: string,
  changes: {
    name?: string;
    description?: string;
  }
): Promise<void> {
  // Note: The 'changes' object in your original helper was different from what api.ts expects.
  // I've adjusted it to pass the data in the { set: ... } format.
  const result = await api.updateGroup(groupChatId, { set: changes });
  
  if (!result.ok) {
    throw new Error(result.error.message || 'Failed to update group');
  }
}

/**
 * Delete a group channel
 */
export async function deleteGroup(
  client: StreamChat,
  api: StreamApi,
  groupChatId: string
): Promise<void> {
  const result = await api.deleteGroup(groupChatId);
  
  if (!result.ok) {
    throw new Error(result.error.message || 'Failed to delete group');
  }
  
  try {
    const channel = client.channel('team', groupChatId);
    await channel.stopWatching();
  } catch {
    // Channel might not exist, ignore
  }
}

/**
 * Add members to a group channel
 */
export async function addGroupMembers(
  client: StreamChat,
  api: StreamApi,
  groupChatId: string,
  memberIds: string[]
): Promise<void> {
  const result = await api.addGroupMembers(groupChatId, memberIds);
  
  if (!result.ok) {
    throw new Error(result.error.message || 'Failed to add members');
  }
}

/**
 * Remove members from a group channel
 */
export async function removeGroupMembers(
  client: StreamChat,
  api: StreamApi,
  groupChatId: string,
  memberIds: string[]
): Promise<void> {
  const result = await api.removeGroupMembers(groupChatId, memberIds);
  
  if (!result.ok) {
    throw new Error(result.error.message || 'Failed to remove members');
  }
}


/**
 * Query DM channels for the current user
 */
export async function queryDMChannels(
  client: StreamChat,
  filters?: ChannelFilters,
  sort?: ChannelSort,
  limit: number = 30
): Promise<Channel[]> {
  const defaultFilters: ChannelFilters = {
    type: 'messaging',
    members: { $in: [client.userID!] },
    ...filters,
  };

  const defaultSort: ChannelSort = sort || [{ last_message_at: -1 }];

  const channels = await client.queryChannels(
    defaultFilters,
    defaultSort,
    {
      limit,
      watch: true,
    }
  );

  return channels;
}

/**
 * Query group channels for the current user
 */
export async function queryGroupChannels(
  client: StreamChat,
  filters?: ChannelFilters,
  sort?: ChannelSort,
  limit: number = 30
): Promise<Channel[]> {
  const defaultFilters: ChannelFilters = {
    type: 'team',
    members: { $in: [client.userID!] },
    ...filters,
  };

  const defaultSort: ChannelSort = sort || [{ last_message_at: -1 }];

  const channels = await client.queryChannels(
    defaultFilters,
    defaultSort,
    {
      limit,
      watch: true,
    }
  );

  return channels;
}

/**
 * Watch a channel by its CID
 */
export async function watchByCid(
  client: StreamChat,
  cid: string
): Promise<Channel> {
  const [type, id] = cid.split(':');
  
  if (!type || !id) {
    throw new Error('Invalid channel CID format');
  }

  const channel = client.channel(type, id);
  await channel.watch();
  
  return channel;
}

/**
 * Get or create a channel by CID (without server call)
 */
export function getChannelByCid(
  client: StreamChat,
  cid: string
): Channel {
  const [type, id] = cid.split(':');
  
  if (!type || !id) {
    throw new Error('Invalid channel CID format');
  }

  return client.channel(type, id);
}

/**
 * Mark a channel as read
 */
export async function markChannelRead(
  channel: Channel
): Promise<void> {
  await channel.markRead();
}

/**
* Search messages across channels
*/
export async function searchMessages(
  client: StreamChat,
  query: string,
  filters?: ChannelFilters,
  limit: number = 20
): Promise<any> {
  const response = await client.search(
    filters || {},
    query,
    {
      limit,
    }
  );

  return response.results;
}

/**
* Get total unread count for current user
*/
export async function getTotalUnreadCount(
  client: StreamChat
): Promise<number> {
  const { total_unread_count } = await client.getUnreadCount();
  return total_unread_count;
}

/**
* Helper to format channel name for display
*/
export function getChannelDisplayName(
  channel: Channel,
  currentUserId?: string
): string {
  if (channel.type === 'messaging' && currentUserId) {
    const members = Object.values(channel.state.members);
    const otherMember = members.find(m => m.user?.id !== currentUserId);
    return otherMember?.user?.name || 'Unknown User';
  }
  return channel.data?.name || 'Unnamed Channel';
}

/**
* Get the last message preview for a channel
*/
export function getLastMessagePreview(channel: Channel): string | null {
  const messages = channel.state.messages;
  if (!messages.length) return null;

  const lastMessage = messages[messages.length - 1];
  return lastMessage.text || null;
}
