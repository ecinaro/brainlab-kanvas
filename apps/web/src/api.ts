export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Yerel sunucuya istek. Kie.ai'ye tarayıcıdan asla doğrudan gidilmez. */
export async function api<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 20_000, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...rest,
      headers: { 'X-Canvas-Client': '1', ...(rest.headers ?? {}) },
      signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = (err as Error).name === 'TimeoutError';
    throw new ApiError(timedOut ? 'Yerel sunucu yanıt vermedi (zaman aşımı)' : 'Yerel sunucuya ulaşılamadı', 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status, body);
  return body as T;
}
