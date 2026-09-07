import { CoreError, CoreErrorCode } from "./errors.js";

export interface HttpResponse {
  status: number;
  headers: Headers;
  cookies: Record<string, string>;
  text: string;
  data: unknown;
  buffer: Buffer;
}

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: string | Uint8Array;
  json?: unknown;
  timeoutMs?: number;
  redirect?: RequestRedirect;
  responseType?: "json" | "text" | "arrayBuffer";
  fetchImpl?: typeof globalThis.fetch;
}

function buildUrl(url: string, query?: Record<string, string | number | boolean | undefined>): string {
  if (!query) return url;
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) parsed.searchParams.set(key, String(value));
  }
  return parsed.toString();
}

function parseSetCookies(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  const values = headers.getSetCookie?.() ?? [];
  for (const cookie of values) {
    const first = cookie.split(";")[0] ?? "";
    const separator = first.indexOf("=");
    if (separator <= 0) continue;
    const name = first.slice(0, separator).trim();
    const value = first.slice(separator + 1).trim();
    if (value) out[name] = value;
  }
  return out;
}

export async function httpRequest(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("timeout")), options.timeoutMs ?? 30_000);
  const headers = new Headers(options.headers ?? {});
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    body = JSON.stringify(options.json);
    headers.set("Content-Type", "application/json");
  } else if (options.body !== undefined) {
    body = options.body as BodyInit;
  }

  try {
    const response = await fetchImpl(buildUrl(url, options.query), {
      method: options.method ?? "GET",
      headers,
      body,
      redirect: options.redirect ?? "follow",
      signal: controller.signal
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const text = buffer.toString("utf-8");
    const looksJson = options.responseType === "json" || /^\s*[\{\[]/.test(text);
    let data: unknown = text;
    if (options.responseType === "arrayBuffer") data = buffer;
    else if (looksJson) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return {
      status: response.status,
      headers: response.headers,
      cookies: parseSetCookies(response.headers),
      text,
      data,
      buffer
    };
  } catch (cause) {
    if ((cause as Error).name === "AbortError" || /timeout/i.test((cause as Error).message)) {
      throw new CoreError(CoreErrorCode.TIMEOUT, "请求超时", { cause });
    }
    throw new CoreError(CoreErrorCode.NETWORK, `网络错误: ${(cause as Error).message}`, { cause });
  } finally {
    clearTimeout(timeout);
  }
}
