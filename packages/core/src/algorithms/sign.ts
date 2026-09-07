import { createHash } from "node:crypto";

const FIRST_INDEXES = [23, 14, 6, 36, 16, 7, 19];
const SECOND_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5];
const SCRAMBLE = [
  89, 39, 179, 150, 218, 82, 58, 252, 177, 52,
  186, 123, 120, 64, 242, 133, 143, 161, 121, 179
];

export function zzcSign(payload: string | Uint8Array): string {
  const bytes = typeof payload === "string" ? Buffer.from(payload, "utf-8") : Buffer.from(payload);
  const digest = createHash("sha1").update(bytes).digest("hex").toUpperCase();
  const first = FIRST_INDEXES.map((index) => digest[index]).join("");
  const second = SECOND_INDEXES.map((index) => digest[index]).join("");
  const tail = new Array(20);
  for (let i = 0; i < 20; i += 1) {
    const pair = Number.parseInt(digest.substring(i * 2, i * 2 + 2), 16);
    tail[i] = SCRAMBLE[i]! ^ pair;
  }
  const base64 = Buffer.from(tail).toString("base64").replace(/[/+=]/g, "");
  return `zzc${first}${base64}${second}`.toLowerCase();
}
