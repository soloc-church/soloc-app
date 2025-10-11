// lib/stream/api.ts
type Fetcher = typeof fetch;

export interface ApiDeps {
  apiBase: string;
  getAuthHeader: () => Promise<string> | string;     
  fetchImpl?: Fetcher;                               
}

export interface ApiError {
  code: string;
  message: string;
  status: number;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

type DmResponse = { cid: string };
type GroupResponse = { cid: string };

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function shouldRetry(method: string, status: number): boolean {
  // Retry only idempotent by default. Add your own allowlist if you use idempotency keys server-side.
  const idempotent = method === 'GET' || method === 'HEAD';
  return idempotent && status >= 500;
}

async function parseBody(res: Response): Promise<any | undefined> {
  const text = await res.text();
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export function createStreamApi({ apiBase, getAuthHeader, fetchImpl }: ApiDeps) {
  const f: Fetcher = fetchImpl ?? fetch;

  async function request<T>(
    path: string,
    init: RequestInit & { idempotent?: boolean } = {}
  ): Promise<Result<T>> {
    const url = `${apiBase}${path}`;
    const method = (init.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {
      Authorization: typeof getAuthHeader === 'function' ? await getAuthHeader() : (getAuthHeader as string),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string>),
    };

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const res = await f(url, { ...init, method, headers, signal: controller.signal });
        clearTimeout(timeout);

        const body = await parseBody(res);

        if (!res.ok) {
          const err: ApiError = {
            code: (body && (body.code || body.error?.code)) || 'HTTP_ERROR',
            message: (body && (body.message || body.error || body.raw)) || res.statusText || 'Request failed',
            status: res.status,
          };
          // idempotent method OR explicitly marked idempotent
          const allowRetry = init.idempotent || shouldRetry(method, res.status);
          if (allowRetry && attempt < maxRetries) {
            await sleep(2 ** attempt * 300);
            continue;
          }
          return { ok: false, error: err };
        }

        return { ok: true, data: (body as T) };
      } catch (e: any) {
        const err: ApiError = {
          code: e?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
          message: e?.message || 'Network error',
          status: 0,
        };
        // Only retry on network failures for idempotent requests
        if ((init.idempotent ?? ['GET','HEAD'].includes(method)) && attempt < maxRetries) {
          await sleep(2 ** attempt * 300);
          continue;
        }
        return { ok: false, error: err };
      }
    }
    // should be unreachable
    return { ok: false, error: { code: 'UNKNOWN', message: 'Unknown error', status: 0 } };
  }

  // ROUTES
  const dm = (otherUserId: string) =>
    request<DmResponse>('/stream-channels/dm', {
      method: 'POST',
      body: JSON.stringify({ otherUserId }),
      idempotent: true,
      headers: { 'Idempotency-Key': `dm:${otherUserId}` },
    });

  const ensureGroup = (groupChatId: string) =>
    request<GroupResponse>('/stream-channels/ensure-group', {
      method: 'POST',
      body: JSON.stringify({ groupChatId }),
      idempotent: true,
      headers: { 'Idempotency-Key': `ensure-group:${groupChatId}` },
    });

  const joinGroup = (groupChatId: string) =>
    request<{ ok: boolean }>('/stream-channels/join-group', {
      method: 'POST',
      body: JSON.stringify({ groupChatId }),
    });

  const leaveGroup = (groupChatId: string) =>
    request<{ ok: boolean }>('/stream-channels/leave-group', {
      method: 'POST',
      body: JSON.stringify({ groupChatId }),
    });

  const updateGroup = (groupChatId: string, changes: { set?: Record<string, any>; unset?: string[] }) =>
    request<{ ok: boolean }>('/stream-channels/update-group', {
      method: 'PATCH',
      body: JSON.stringify({ groupChatId, ...changes }),
    });

  const deleteGroup = (groupChatId: string) =>
    request<{ ok: boolean }>(`/stream-channels/delete-group/${encodeURIComponent(groupChatId)}`, {
      method: 'DELETE',
    });

  const createGroup = (params: {
    name: string; description?: string; visibility: 'public' | 'members' | 'private'; memberIds: string[]; image?: string;
  }) =>
    request<{ id: string; cid: string }>('/stream-channels/create-group', {
      method: 'POST',
      body: JSON.stringify(params),
    });

  const addGroupMembers = (groupChatId: string, memberIds: string[]) =>
    request<{ ok: boolean }>('/stream-channels/add-members', {
      method: 'POST',
      body: JSON.stringify({ groupChatId, memberIds }),
    });

  const removeGroupMembers = (groupChatId: string, memberIds: string[]) =>
    request<{ ok: boolean }>('/stream-channels/remove-members', {
      method: 'POST',
      body: JSON.stringify({ groupChatId, memberIds }),
    });

  return {
    dm,
    ensureGroup,
    joinGroup,
    leaveGroup,
    updateGroup,
    deleteGroup,
    createGroup,
    addGroupMembers,
    removeGroupMembers,
  };
}

export type StreamApi = ReturnType<typeof createStreamApi>;
