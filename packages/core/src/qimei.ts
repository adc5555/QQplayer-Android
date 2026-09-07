import { createCipheriv, publicEncrypt, randomBytes } from "node:crypto";
import type { AndroidDevice } from "./device.js";
import type { HttpResponse } from "./http.js";
import { calcMd5 } from "./utils/common.js";

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDEIxgwoutfwoJxcGQeedgP7FG9qaIuS0qzfR8gWkrkTZKM2iWHn2ajQpBRZjMSoSf6+KJGvar2ORhBfpDXyVtZCKpqLQ+FLkpncClKVIrBwv6PHyUvuCb0rIarmgDnzkfQAqVufEtR64iazGDKatvJ9y6B9NMbHddGSAUmRTCrHQIDAQAB
-----END PUBLIC KEY-----`;
const SECRET = "ZdJqM15EeO2zWc08";
const APP_KEY = "0AND0HD6FE4HY80F";
const CHANNEL_ID = "10003505";
const PACKAGE_ID = "com.tencent.qqmusic";
const QIMEI_HOST = "https://api.tencentmusic.com/tme/trpc/proxy";
const HEX_CHARS = "0123456789abcdef";

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomHexNonZero(length: number): string {
  const chars = HEX_CHARS.slice(1);
  let out = "";
  for (let i = 0; i < length; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function randomHexChars(length: number): string {
  return randomBytes(length).toString("hex").slice(0, length);
}

function randomBeaconId(): string {
  const now = new Date();
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const first = randomInt(100000, 999999);
  const second = randomInt(100000000, 999999999);
  const parts: string[] = [];
  const special = new Set([1, 2, 13, 14, 17, 18, 21, 22, 25, 26, 29, 30, 33, 34, 37, 38]);
  for (let i = 1; i <= 40; i += 1) {
    if (special.has(i)) parts.push(`k${i}:${monthStart}${first}.${second}`);
    else if (i === 3) parts.push("k3:0000000000000000");
    else if (i === 4) parts.push(`k4:${randomHexNonZero(16)}`);
    else parts.push(`k${i}:${randomInt(0, 9999)}`);
    parts.push(";");
  }
  return parts.join("");
}

function rsaEncrypt(content: Buffer): Buffer {
  return publicEncrypt({ key: PUBLIC_KEY, padding: 1 }, content);
}

function aesEncrypt(key: Buffer, content: Buffer): Buffer {
  const paddingSize = 16 - (content.length % 16);
  const padded = Buffer.concat([content, Buffer.alloc(paddingSize, paddingSize)]);
  const cipher = createCipheriv("aes-128-cbc", key, key);
  return Buffer.concat([cipher.update(padded), cipher.final()]);
}

function buildPayload(device: AndroidDevice, appVersion: string, sdkVersion: string): Record<string, unknown> {
  const uptime = new Date(Date.now() - randomInt(0, 14400) * 1000);
  const uptimeStr = uptime.toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  const reserved = {
    harmony: "0",
    clone: "0",
    containe: "",
    oz: "UhYmelwouA+V2nPWbOvLTgN2/m8jwGB+yUB5v9tysQg=",
    oo: "Xecjt+9S1+f8Pz2VLSxgpw==",
    kelong: "0",
    uptimes: uptimeStr,
    multiUser: "0",
    bod: device.brand,
    dv: device.device,
    firstLevel: "",
    manufact: device.brand,
    name: device.model,
    host: "se.infra",
    kernel: device.procVersion
  };
  return {
    androidId: device.androidId,
    platformId: 1,
    appKey: APP_KEY,
    appVersion,
    beaconIdSrc: randomBeaconId(),
    brand: device.brand,
    channelId: CHANNEL_ID,
    cid: "",
    imei: device.imei,
    imsi: "",
    mac: "",
    model: device.model,
    networkType: "unknown",
    oaid: "",
    osVersion: `Android ${device.version.release},level ${device.version.sdk}`,
    qimei: "",
    qimei36: "",
    sdkVersion,
    targetSdkVersion: "33",
    audit: "",
    userId: "{}",
    packageId: PACKAGE_ID,
    deviceType: "Phone",
    sdkName: "",
    reserved: JSON.stringify(reserved)
  };
}

export interface QimeiRequest {
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export function buildQimeiRequest(device: AndroidDevice, appVersion: string, sdkVersion: string): QimeiRequest {
  const payload = buildPayload(device, appVersion, sdkVersion);
  const cryptKey = Buffer.from(randomHexChars(16), "utf-8");
  const nonce = randomHexChars(16);
  const ts = Math.floor(Date.now() / 1000);

  const key = rsaEncrypt(cryptKey).toString("base64");
  const params = aesEncrypt(cryptKey, Buffer.from(JSON.stringify(payload), "utf-8")).toString("base64");
  const extra = `{"appKey":"${APP_KEY}"}`;
  const reqSign = calcMd5(key, params, String(ts * 1000), nonce, SECRET, extra);

  return {
    headers: {
      Host: "api.tencentmusic.com",
      method: "GetQimei",
      service: "trpc.tme_datasvr.qimeiproxy.QimeiProxy",
      appid: "qimei_qq_android",
      sign: calcMd5("qimei_qq_androidpzAuCmaFAaFaHrdakPjLIEqKrGnSOOvH", String(ts)),
      "user-agent": "QQMusic",
      timestamp: String(ts),
      "Content-Type": "application/json"
    },
    body: {
      app: 0,
      os: 1,
      qimeiParams: { key, params, time: String(ts), nonce, sign: reqSign, extra }
    }
  };
}

export function parseQimeiResponse(response: HttpResponse): { q16: string; q36: string } {
  let inner: unknown;
  const data = response.data as { data?: unknown } | undefined;
  if (typeof data?.data === "string") {
    try {
      inner = (JSON.parse(data.data) as { data?: unknown }).data;
    } catch (cause) {
      throw new Error(`QIMEI 响应 data 不是 JSON: ${(cause as Error).message}`);
    }
  } else if (data && typeof data.data === "object" && data.data !== null) {
    inner = (data.data as { data?: unknown }).data;
  }
  const result = inner as { q16?: string; q36?: string } | undefined;
  if (!result?.q16 || !result?.q36) throw new Error("QIMEI 响应缺少 q16/q36");
  return { q16: result.q16, q36: result.q36 };
}
