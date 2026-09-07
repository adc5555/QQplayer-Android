const SENSITIVE_KEYS = [
  /cookie/i,
  /set-cookie/i,
  /vkey/i,
  /musickey/i,
  /refresh_token/i,
  /access_token/i,
  /credential/i,
  /qrsig/i,
  /ptsigx/i,
  /p_skey/i,
  /skey/i,
  /imei/i,
  /androidId/i
];

export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.some((pattern) => pattern.test(key))
        ? "[REDACTED]"
        : redactValue(item);
    }
    return out;
  }
  return value;
}
