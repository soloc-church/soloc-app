import { StreamChat, Channel, UserResponse } from 'stream-chat';
import { supabase } from '../supabase';

const STREAM_API_KEY = process.env.EXPO_PUBLIC_STREAM_KEY
const API_BASE =  process.env.EXPO_PUBLIC_API_URL!;

type TokenPayload = { token: string; apiKey?: string; streamUserId: string };



async function getAuthHeader (): Promise<string> {
  const {data: {session}} = await supabase.auth.getSession();
  if(!session?.access_token) throw new Error ('Not Authenticated');
  return `Bearer ${session.access_token}`;
}

// call stream-token; return token, mapped stream userid
async function fetchTokenPayload (): Promise<TokenPayload> {
  const auth = await getAuthHeader();
    const res = await fetch(`${API_BASE}/stream-token`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
  });
  const json = await res.json();
  if(!res.ok) throw new Error(json.error || 'Fetching stream failed');

  return {token: json.token, apiKey: json.apiKey, streamUserId: json.streamUserId}
}

// uses cached token; refreshes on demand
function makeTokenProvider(firstToken: string) {
  let cached = firstToken;
  return async () => {
    if (cached) {
      const t = cached;
      cached = null;
      return t;
    } else {
      const next = await fetchTokenPayload();
      return next.token;
    }
  }
}

export class StreamChatService {
  private client: StreamChat | null = null;
  private currentUser: UserResponse | null = null;
  private streamUserId: string | null = null;

  //initialize the stream client
  async initialize () {
    if(!this.client) {
      this.client = StreamChat.getInstance(STREAM_API_KEY);
    }

    return this.client;
  }

  // connect current user to stream chat
  async connectUser() {
    const { data: {user}, } = await supabase.auth.getUser();
    if(!user) throw new Error("Not Authenticated");

    const { data: profile} = await supabase
      .from('prpofiles')
      .select('full_name, profile_image_url')
      .eq('id', user.id)
      .single();

    const first = await fetchTokenPayload();
    this.streamUserId = first.streamUserId;

    //token provider for renewals
    const tokenProvider = makeTokenProvider(first.token);


    //connect
    await this.client!.connectUser(
      {
        id: this.streamUserId,
        name: profile?.full_name ?? user.email ?? user.id,
        image: profile?.profile_image_url ?? undefined,
      },
      tokenProvider
    );
    this.currentUser = this.client!.user;

    return this.currentUser;
  }

  // disconnect
  async disconnect () {
    if (this.client && this.currentUser) {
      await this.client.disconnectUser();
      this.currentUser = null;
      this.streamUserId = null;
    }
  }

  async getOrCreateDMChannel(otherUserId: string): Promise<Channel> {
    if(!this.client || this.streamUserId) throw new Error("Stream chat not connected");

    const auth = await getAuthHeader();
    const res = await fetch(`${API_BASE}/stream-channels/dm`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({otherUserId}),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to create DM channel');

    const [type, id] = String(json.cid).split(':');
    const channel = this.client.channel(type, id);
    await channel.watch();

    return channel;
  }

  async getOrCreateGroupChannel(groupId: string): Promise<Channel> {
    if (!this.client || !this.streamUserId) throw new Error('Stream Chat not connected');

    const auth = await getAuthHeader();
    const res = await fetch(`${API_BASE}/stream-channels/ensure-group`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupChatId: groupId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to ensure group channel');

    const [type, id] = String(json.cid).split(':');
    const channel = this.client.channel(type, id);
    await channel.watch();
    return channel;
  } 

  async joinGroupChannel(groupId: string): Promise<Channel> {
    if (!this.client || !this.streamUserId) throw new Error('Stream Chat not connected');

    const auth = await getAuthHeader();
    const res = await fetch(`${API_BASE}/stream-channels/join-group`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupChatId: groupId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to join group');

    // After joining, ensure & watch the channel
    return this.getOrCreateGroupChannel(groupId);
  }

  async leaveGroupChannel(groupId: string): Promise<void> {
    if (!this.client || !this.streamUserId) throw new Error('Stream Chat not connected');

    const auth = await getAuthHeader();
    const res = await fetch(`${API_BASE}/stream-channels/leave-group`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupChatId: groupId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to leave group');
  }

  // get user's dm channels
  async getUserDMChannels(): Promise<Channel[]> {
    if (!this.client || !this.streamUserId) throw new Error('Stream Chat not connected');

    const filter = { type: 'messaging', members: { $in: [this.streamUserId] } };
    const sort = [{ last_message_at: -1 as const }];
    const channels = await this.client.queryChannels(filter, sort);
    return channels;
  }

  async getUserGroupChannels(): Promise<Channel[]> {
    if (!this.client || !this.streamUserId) throw new Error('Stream Chat not connected');

    const filter = { type: 'team', members: { $in: [this.streamUserId] } };
    const sort = [{ last_message_at: -1 as const }];
    const channels = await this.client.queryChannels(filter, sort);
    return channels;
  }

   /** Admin updates go through the server so RBAC is enforced */
  async updateGroupChannel(groupId: string, updates: { name?: string; description?: string }) {
    const auth = await getAuthHeader();
    const res = await fetch(`${API_BASE}/stream-channels/update-group`, {
      method: 'PATCH',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupChatId: groupId, ...updates }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to update group');
  }

  async deleteGroupChannel(groupId: string) {
    const auth = await getAuthHeader();
    const res = await fetch(`${API_BASE}/stream-channels/delete-group`, {
      method: 'DELETE',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupChatId: groupId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to delete group');
  }

  getClient(): StreamChat | null { return this.client; }
  getCurrentUser(): UserResponse | null { return this.currentUser; }
}

export const streamChatService = new StreamChatService();