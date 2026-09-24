/** Kie.ai HTTP istemcisi. Key yalnızca burada, sunucu tarafında kullanılır. */
import { openAsBlob } from 'node:fs';
import { basename } from 'node:path';

const CODE_MESSAGES: Record<number, string> = {
  0: 'Ağ hatası',
  401: 'API key geçersiz veya eksik',
  402: 'Kredi yetersiz',
  404: 'Kaynak bulunamadı',
  408: 'Sağlayıcı 10 dakikadan uzun süredir yanıt vermiyor',
  422: 'Parametre doğrulama hatası',
  429: 'Hız sınırı aşıldı',
  433: 'Alt key kullanım sınırı aşıldı',
  455: 'Kie.ai bakımda',
  500: 'Kie.ai sunucu hatası',
  501: 'Üretim başarısız',
  505: 'Özellik devre dışı',
};

export class KieError extends Error {
  constructor(
    public readonly code: number,
    public readonly detail: string,
  ) {
    super(`${CODE_MESSAGES[code] ?? 'Bilinmeyen hata'} (${code})${detail ? `: ${detail}` : ''}`);
  }
  /** Otomatik yeniden denemeye uygun geçici hata mı? */
  get retryable() {
    return this.code === 0 || this.code === 429 || this.code === 455 || this.code === 500;
  }
}

export type KieState = 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';

export interface KieTaskInfo {
  taskId: string;
  state: KieState;
  resultUrls: string[];
  resultObject: unknown;
  failCode: string;
  failMsg: string;
  creditsConsumed: number | null;
  progress: number | null;
}

interface KieEnvelope<T> {
  code: number;
  msg: string;
  data: T;
}

interface RawTaskInfo {
  taskId: string;
  state: string;
  resultJson?: string | null;
  failCode?: string | null;
  failMsg?: string | null;
  creditsConsumed?: number | null;
  progress?: number | null;
}

/** recordInfo'daki resultJson bir JSON string; hem resultUrls hem resultObject biçimi olabilir. */
export function parseResultJson(raw: string | null | undefined): { resultUrls: string[]; resultObject: unknown } {
  if (!raw) return { resultUrls: [], resultObject: null };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const urls = Array.isArray(parsed?.resultUrls) ? parsed.resultUrls.filter((u: unknown) => typeof u === 'string') : [];
    return { resultUrls: urls, resultObject: parsed?.resultObject ?? null };
  } catch {
    return { resultUrls: [], resultObject: null };
  }
}

export interface KieClientOptions {
  apiKey: string;
  baseUrl: string;
  uploadBaseUrl: string;
  fetchImpl?: typeof fetch;
}

export class KieClient {
  readonly fetchImpl: typeof fetch;
  constructor(private opts: KieClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get hasKey() {
    return this.opts.apiKey.length > 0;
  }

  private async request<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
    if (!this.hasKey) throw new KieError(401, '.env dosyasında KIE_API_KEY tanımlı değil');
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        ...init,
        headers: { Authorization: `Bearer ${this.opts.apiKey}`, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
      });
    } catch (err) {
      throw new KieError(0, (err as Error).message);
    }
    let json: KieEnvelope<T> | null = null;
    try {
      json = (await res.json()) as KieEnvelope<T>;
    } catch {
      /* gövde JSON değil */
    }
    // Doküman örneklerinde HTTP 200 + gövdede farklı code görülebiliyor; ikisine de bakılır.
    const code = json?.code ?? res.status;
    if (!res.ok || code !== 200) {
      throw new KieError(code === 200 ? res.status : code, json?.msg ?? res.statusText);
    }
    return json!.data;
  }

  private json(method: 'GET' | 'POST', path: string, body?: unknown) {
    return <T>() =>
      this.request<T>(`${this.opts.baseUrl}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
  }

  /** GET /api/v1/chat/credit → kalan kredi */
  async getCredits(): Promise<number> {
    return Number(await this.json('GET', '/api/v1/chat/credit')<number>());
  }

  /** POST /api/v1/jobs/createTask → taskId */
  async createTask(model: string, input: Record<string, unknown>): Promise<string> {
    const data = await this.json('POST', '/api/v1/jobs/createTask', { model, input })<{ taskId: string }>();
    if (!data?.taskId) throw new KieError(500, 'Yanıtta taskId yok');
    return data.taskId;
  }

  /** GET /api/v1/jobs/recordInfo?taskId= */
  async getTask(taskId: string): Promise<KieTaskInfo> {
    const raw = await this.json('GET', `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`)<RawTaskInfo>();
    const { resultUrls, resultObject } = parseResultJson(raw.resultJson);
    return {
      taskId: raw.taskId ?? taskId,
      state: raw.state as KieState,
      resultUrls,
      resultObject,
      failCode: raw.failCode ?? '',
      failMsg: raw.failMsg ?? '',
      creditsConsumed: typeof raw.creditsConsumed === 'number' ? raw.creditsConsumed : null,
      progress: typeof raw.progress === 'number' ? raw.progress : null,
    };
  }

  /** POST {uploadBase}/api/file-stream-upload (multipart) → geçici indirme URL'i */
  async uploadFile(filePath: string, fileName = basename(filePath)): Promise<string> {
    const form = new FormData();
    form.append('file', await openAsBlob(filePath), fileName);
    form.append('uploadPath', 'brainlab-kanvas');
    form.append('fileName', fileName);
    const data = await this.request<{ downloadUrl?: string; fileUrl?: string }>(
      `${this.opts.uploadBaseUrl}/api/file-stream-upload`,
      { method: 'POST', body: form, timeoutMs: 120_000 },
    );
    const url = data?.downloadUrl ?? data?.fileUrl;
    if (!url) throw new KieError(500, 'Yükleme yanıtında URL yok');
    return url;
  }
}
