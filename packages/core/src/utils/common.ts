import { createHash, randomBytes, randomUUID } from "node:crypto";

export function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

export function getGuid(): string {
  return randomUUID().replace(/-/g, "");
}

export function calcMd5(...parts: Array<string | Uint8Array>): string {
  const hash = createHash("md5");
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
}

export function hash33(value: string, seed = 0): number {
  let h = seed | 0;
  for (let i = 0; i < value.length; i += 1) {
    h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  }
  return 2147483647 & h;
}

export function getSearchId(): string {
  const e = Math.floor(Math.random() * 20) + 1;
  const t = e * 18014398509481984;
  const n = Math.floor(Math.random() * 4194304) * 4294967296;
  const r = Math.round(Date.now()) % (24 * 60 * 60 * 1000);
  return String(t + n + r);
}

export function boolToInt<T>(value: T): T {
  if (typeof value === "boolean") return (value ? 1 : 0) as T;
  if (Array.isArray(value)) return value.map((item) => boolToInt(item)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = boolToInt(item);
    return out as T;
  }
  return value;
}

export function sanitizeForFilename(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
}
