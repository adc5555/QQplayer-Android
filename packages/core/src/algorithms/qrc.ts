import { inflateSync } from "node:zlib";
import { tripledesCrypt, tripledesKeySetup, DECRYPT } from "./tripledes.js";

const QRC_KEY = Buffer.from("!@#)(*$%123ZXC!@!@#)(NHL", "utf-8");

export function qrcDecrypt(encryptedHex: string): string {
  if (!encryptedHex) return "";
  const ciphertext = Buffer.from(encryptedHex, "hex");
  if (ciphertext.length === 0) return "";

  const schedule = tripledesKeySetup(QRC_KEY, DECRYPT);
  const decrypted = Buffer.alloc(ciphertext.length);
  for (let offset = 0; offset + 8 <= ciphertext.length; offset += 8) {
    const block = tripledesCrypt(ciphertext.subarray(offset, offset + 8), schedule);
    decrypted.set(block, offset);
  }

  try {
    return inflateSync(decrypted).toString("utf-8");
  } catch (cause) {
    throw new Error(`QRC zlib 解压失败: ${(cause as Error).message}`);
  }
}
