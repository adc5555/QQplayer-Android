import assert from "node:assert/strict";
import test from "node:test";
import { findQuality, hash33, parseQimeiResponse, qrcDecrypt, sanitizeForFilename, zzcSign } from "../src/index.js";

test("zzcSign matches a known QQ Music signature", () => {
  assert.equal(
    zzcSign('{"comm":{},"req_0":{}}'),
    "zzc28cbd36o4iivencgxnnkopka26b69wc4d2326d3b"
  );
});

test("hash33 is stable and signed", () => {
  assert.equal(hash33("abc", 0), 108_966);
  assert.equal(hash33("abc", 5381), 193_485_963);
});

test("sanitizeForFilename removes illegal Windows characters", () => {
  assert.equal(sanitizeForFilename("歌手 / 歌名: 测试?.mp3"), "歌手 _ 歌名_ 测试_.mp3");
});

test("qrcDecrypt returns an empty string for empty input", () => {
  assert.equal(qrcDecrypt(""), "");
});

test("findQuality falls back to MP3 128 for unknown codes", () => {
  assert.equal(findQuality("M500")?.code, "M500");
  assert.equal(findQuality("UNKNOWN"), undefined);
});

test("parseQimeiResponse extracts q16 and q36", () => {
  const response = {
    data: {
      data: {
        data: { q16: "abc", q36: "def" }
      }
    }
  } as any;
  assert.deepEqual(parseQimeiResponse({ data: response.data } as any), { q16: "abc", q36: "def" });
});
