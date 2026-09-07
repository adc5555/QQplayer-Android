import type { PlatformName } from "./types.js";
import { CoreError, CoreErrorCode } from "./errors.js";
import { DeviceManager } from "./device.js";
import { buildComm, getUserAgent, getVersionProfile, type CredentialLike } from "./versioning.js";
import { buildQimeiRequest, parseQimeiResponse } from "./qimei.js";
import { httpRequest, type HttpRequestOptions } from "./http.js";
import { zzcSign } from "./algorithms/sign.js";
import { boolToInt } from "./utils/common.js";
import { redactValue } from "./utils/redact.js";
import type { RequestSpec } from "./request.js";

const MUSICU_URL = "https://u.y.qq.com/cgi-bin/musicu.fcg";
const MUSICS_URL = "https://u.y.qq.com/cgi-bin/musics.fcg";

export interface ClientOptions {
  platform: PlatformName;
  dataDir: string;
  fetchImpl?: typeof globalThis.fetch;
  debug?: boolean;
}

export class QqMusicClient {
  readonly platform: PlatformName;
  readonly devices: DeviceManager;
  private readonly fetchImpl?: typeof globalThis.fetch;
  private readonly debug: boolean;
  private credential: CredentialLike = {};
  private sessionReady = false;
  private sessionPromise?: Promise<void>;
  private qimeiPromise?: Promise<{ q16: string; q36: string }>;

  constructor(options: ClientOptions) {
    this.platform = options.platform;
    this.devices = new DeviceManager(options.dataDir);
    this.fetchImpl = options.fetchImpl;
    this.debug = options.debug ?? false;
  }

  getCredential(): CredentialLike {
    return this.credential;
  }

  setCredential(credential: CredentialLike): void {
    this.credential = credential;
  }

  async getDevice() {
    return this.devices.getDevice();
  }

  async warmup(): Promise<void> {
    if (this.platform === "android") await this.ensureSession();
  }

  async request(method: string, url: string, options: HttpRequestOptions = {}): Promise<Awaited<ReturnType<typeof httpRequest>>> {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (!headers["User-Agent"]) headers["User-Agent"] = getUserAgent(this.platform, await this.getDevice());
    return httpRequest(url, { ...options, method, headers, fetchImpl: this.fetchImpl });
  }

  async requestApi(specs: RequestSpec[]): Promise<Record<string, unknown>> {
    if (this.platform === "android") await this.ensureSession();
    const device = await this.getDevice();
    const qimei = this.platform === "android" ? await this.ensureQimei(device) : undefined;
    const first = specs[0];
    if (!first) throw new CoreError(CoreErrorCode.INVALID_ARGUMENT, "没有可执行的请求");
    const credential = first.credential ?? this.credential;
    const platform = first.platform ?? this.platform;
    const comm = buildComm(platform, credential, device, qimei);
    Object.assign(comm, first.comm ?? {});

    const payload: Record<string, unknown> = { comm };
    specs.forEach((spec, index) => {
      const param = spec.preserveBool ? spec.param : boolToInt(spec.param);
      payload[`req_${index}`] = { module: spec.module, method: spec.method, param };
    });

    const sign = specs.some((spec) => spec.sign);
    const query: Record<string, string> = {};
    if (sign) {
      query._ = String(Date.now());
      query.sign = zzcSign(JSON.stringify(payload));
    }
    const response = await this.request("POST", sign ? MUSICS_URL : MUSICU_URL, {
      json: payload,
      query,
      headers: { "User-Agent": getUserAgent(platform, device) }
    });
    if (this.debug) console.debug("[qqplayer]", redactValue({ url: sign ? MUSICS_URL : MUSICU_URL, payload, response: response.text.slice(0, 400) }));
    return this.validateApiResponse(response);
  }

  async execute(spec: RequestSpec): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const data = await this.requestApi([spec]);
        return this.parseItem(data.req_0, spec);
      } catch (error) {
        lastError = error;
        if (!(error instanceof CoreError) || error.code !== CoreErrorCode.RATE_LIMITED || attempt >= 2) {
          throw error;
        }
        await sleep(1_000 * (attempt + 1) + Math.floor(Math.random() * 800));
      }
    }
    throw lastError;
  }

  private validateApiResponse(response: Awaited<ReturnType<typeof httpRequest>>): Record<string, unknown> {
    if (response.status !== 200) {
      throw new CoreError(CoreErrorCode.HTTP, `HTTP ${response.status}`, { statusCode: response.status, data: response.text });
    }
    if (!response.text) throw new CoreError(CoreErrorCode.INVALID_RESPONSE, "响应为空");
    if (typeof response.data !== "object" || response.data === null) {
      throw new CoreError(CoreErrorCode.INVALID_RESPONSE, "响应不是 JSON 对象", { data: response.text });
    }
    const json = response.data as { code?: number };
    if ((json.code ?? 0) !== 0) {
      throw new CoreError(CoreErrorCode.INVALID_RESPONSE, `模块返回异常 ${json.code ?? 0}`, { data: json });
    }
    return json as Record<string, unknown>;
  }

  private parseItem(item: unknown, spec: RequestSpec): unknown {
    const record = item as { code?: number; data?: unknown } | undefined;
    const code = record?.code ?? 0;
    const data = record?.data ?? {};
    if (spec.allowErrorCodes) {
      const allowed = spec.allowErrorCodes === "all" || spec.allowErrorCodes.has(code);
      if (code === 0 || allowed) return spec.parseOnAllow ? data : record;
    }
    switch (code) {
      case 0:
        return data;
      case 2000:
        throw new CoreError(CoreErrorCode.SIGNATURE_REQUIRED, "请求需要签名", { data: record });
      case 2001:
        throw new CoreError(CoreErrorCode.RATE_LIMITED, "请求被限流", { data: record });
      case 1000:
      case 104400:
      case 104401:
        throw new CoreError(CoreErrorCode.AUTH_REQUIRED, "需要有效登录凭证", { data: record });
      default:
        throw new CoreError(CoreErrorCode.INVALID_RESPONSE, `业务返回非零码 ${code}`, { data: record });
    }
  }

  private ensureSession(): Promise<void> {
    if (this.sessionReady) return Promise.resolve();
    if (!this.sessionPromise) this.sessionPromise = this.doEnsureSession();
    return this.sessionPromise;
  }

  private async doEnsureSession(): Promise<void> {
    try {
      const device = await this.getDevice();
      if (device.sessionUid && device.sessionSid && Date.now() / 1000 - (device.sessionSaveTime ?? 0) < 86400) {
        this.sessionReady = true;
        return;
      }
      const qimei = await this.ensureQimei(device);
      const payload = {
        comm: buildComm("android", this.credential, device, qimei),
        req_0: {
          module: "music.getSession.session",
          method: "GetSession",
          param: { uid: device.sessionUid || "", vkey: 0, caller: 0 }
        }
      };
      const response = await this.request("POST", MUSICU_URL, { json: payload });
      const json = typeof response.data === "object" && response.data !== null
        ? response.data
        : JSON.parse(response.text || "{}");
      const session = (json as any)?.req_0?.data?.session;
      if (!session?.uid || !session?.sid) {
        throw new CoreError(CoreErrorCode.INVALID_RESPONSE, `获取 session 失败: ${response.text.slice(0, 200)}`);
      }
      await this.devices.setSession({ uid: String(session.uid), sid: session.sid, vkey: Number(session.vkey ?? 0) });
      this.sessionReady = true;
    } catch (error) {
      this.sessionPromise = undefined;
      throw error;
    }
  }

  private ensureQimei(device: Awaited<ReturnType<typeof this.getDevice>>): Promise<{ q16: string; q36: string }> {
    if (this.qimeiPromise) return this.qimeiPromise;
    if (device.qimei && device.qimei36 && Date.now() / 1000 - (device.qimeiSaveTime ?? 0) < 86400) {
      return Promise.resolve({ q16: device.qimei, q36: device.qimei36 });
    }
    this.qimeiPromise = this.registerQimei(device).catch((error) => {
      this.qimeiPromise = undefined;
      throw error;
    });
    return this.qimeiPromise;
  }

  private async registerQimei(device: Awaited<ReturnType<typeof this.getDevice>>): Promise<{ q16: string; q36: string }> {
    const profile = getVersionProfile("android");
    const qimeiRequest = buildQimeiRequest(device, profile.appVersion, profile.sdkVersion);
    const response = await this.request("POST", "https://api.tencentmusic.com/tme/trpc/proxy", {
      json: qimeiRequest.body,
      headers: qimeiRequest.headers
    });
    const result = parseQimeiResponse(response);
    await this.devices.applyQimei(result.q16, result.q36);
    return result;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
