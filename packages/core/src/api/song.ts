import { CoreError, CoreErrorCode } from "../errors.js";
import {
  AUDIO_QUALITIES,
  DEFAULT_QUALITY_CODE,
  findQuality,
  type AudioQuality,
  type LyricDocument,
  type LyricLine,
  type ResolvedMedia,
  type Track
} from "../types.js";
import type { QqMusicClient } from "../client.js";
import { qrcDecrypt } from "../algorithms/qrc.js";

const COVER_TEMPLATE = "https://y.qq.com/music/photo_new/T002R300x300M000{id}.jpg";

export class SongApi {
  constructor(private readonly client: QqMusicClient) {}

  async getTrack(trackId: string): Promise<Track> {
    const data = await this.client.execute({
      module: "music.pf_song_detail_svr",
      method: "get_song_detail_yqq",
      param: /^\d+$/.test(trackId) ? { song_id: Number(trackId) } : { song_mid: trackId },
      platform: "web"
    });
    const track = mapTrack((data as any)?.track_info);
    if (!track) throw new CoreError(CoreErrorCode.NOT_FOUND, "歌曲详情不存在", { data });
    return track;
  }

  async resolveUrl(trackId: string, preferredQuality = DEFAULT_QUALITY_CODE): Promise<ResolvedMedia> {
    const mid = /^\d+$/.test(trackId) ? ((await this.getTrack(trackId)).mid || trackId) : trackId;
    const qualities = orderedQualities(preferredQuality);
    const result = await this.fetchVkeyBatch(mid, qualities);
    const playable = result.find((item) => Boolean(item.url));
    if (playable) {
      return { trackId, quality: playable.quality, url: playable.url };
    }
    if (result.length > 0 && result.every((item) => item.errorCode === 104003)) {
      throw new CoreError(CoreErrorCode.NO_PERMISSION, "所有音质均无权限 / 需要 VIP", { data: result });
    }
    throw new CoreError(CoreErrorCode.NO_PLAYABLE_URL, "没有可用播放地址", { data: result });
  }

  private async fetchVkeyBatch(mid: string, qualities: AudioQuality[]): Promise<Array<{ quality: AudioQuality; url: string; errorCode?: number }>> {
    const device = await this.client.getDevice();
    const data = await this.client.execute({
      module: "music.vkey.GetVkey",
      method: "UrlGetVkey",
      param: {
        guid: device.openUdid,
        songmid: qualities.map(() => mid),
        songtype: qualities.map(() => 0),
        filename: qualities.map((quality) => `${quality.code}${mid}${mid}${quality.ext}`),
        uin: "",
        loginflag: 0,
        platform: "23",
        h5queryversion: 1,
        nettype: "",
        jsonpCallback: "jsonp1",
        cms: 0,
        firstlogin: 1,
        newver: 1,
        nohash: 0,
        format: "json",
        inCharset: "utf-8",
        outCharset: "utf-8",
        notice: 0,
        needNewCode: 0,
        songmid_pre: "",
        soundname: "",
        bitrate: 0,
        quality: ""
      },
      platform: "android"
    });
    const sip = Array.isArray((data as any)?.sip) && (data as any).sip.length > 0 ? (data as any).sip : undefined;
    const infos = Array.isArray((data as any)?.midurlinfo) ? (data as any).midurlinfo : [];
    return qualities.map((quality, index) => {
      const info = infos[index] ?? {};
      const url = info?.purl ? buildMediaUrl(info.purl, sip) : "";
      return { quality, url, errorCode: Number(info?.result ?? 0) };
    });
  }

  async getLyrics(trackId: string): Promise<LyricDocument> {
    const track = await this.getTrack(trackId);
    const param: Record<string, unknown> = {
      crypt: 1,
      lrc_t: 0,
      qrc: 1,
      qrc_t: 0,
      roma: 0,
      roma_t: 0,
      trans: 1,
      trans_t: 1,
      type: 1,
      userIP: "127.0.0.1",
      ct: 11,
      cv: 14090008
    };
    if (/^\d+$/.test(trackId)) param.songId = Number(trackId);
    else param.songMID = trackId;
    const data = await this.client.execute({
      module: "music.musichallSong.PlayLyricInfo",
      method: "GetPlayLyricInfo",
      param,
      platform: "android"
    });
    return parseLyricDocument(trackId, data);
  }
}

export function mapTrackList(list: unknown[]): Track[] {
  return list.map(mapTrack).filter((track): track is Track => Boolean(track));
}

export function mapTrack(item: any): Track | undefined {
  if (!item || typeof item !== "object") return undefined;
  const mid = String(item.mid ?? item.songmid ?? item.songMid ?? item.song_id ?? item.id ?? "");
  if (!mid) return undefined;
  const album = item.album ?? item.albumInfo ?? {};
  const albumMid = String(album.mid ?? album.albummid ?? album.albumMid ?? "");
  const albumPmid = String(album.pmid ?? album.albumPmid ?? album.pm ?? "");
  const title = String(item.name ?? item.songname ?? item.title ?? item.songName ?? "未知歌曲");
  const singers = Array.isArray(item.singer)
    ? item.singer
    : Array.isArray(item.singers)
      ? item.singers
      : [];
  return {
    id: String(item.id ?? item.song_id ?? item.songid ?? mid),
    mid,
    title,
    subtitle: item.subtitle ? String(item.subtitle) : undefined,
    artists: singers.map((singer: any) => ({
      id: singer.id ? Number(singer.id) : undefined,
      mid: singer.mid ? String(singer.mid) : undefined,
      name: String(singer.name ?? singer.singerName ?? singer.singername ?? "未知歌手")
    })),
    album: {
      id: album.id ? Number(album.id) : undefined,
      mid: albumMid,
      name: String(album.name ?? album.albumname ?? album.albumName ?? "未知专辑"),
      coverUrl: albumPmid ? COVER_TEMPLATE.replace("{id}", albumPmid) : albumMid ? COVER_TEMPLATE.replace("{id}", albumMid) : undefined
    },
    durationSec: Number(item.interval ?? item.duration ?? item.playTime ?? 0) || undefined,
    coverUrl: albumPmid ? COVER_TEMPLATE.replace("{id}", albumPmid) : albumMid ? COVER_TEMPLATE.replace("{id}", albumMid) : undefined
  };
}

function orderedQualities(preferred: string): AudioQuality[] {
  const ordered: AudioQuality[] = [];
  const preferredQuality = findQuality(preferred);
  if (preferredQuality) ordered.push(preferredQuality);
  const rest = AUDIO_QUALITIES
    .filter((quality) => !ordered.some((item) => item.code === quality.code))
    .sort((a, b) => qualityBitrate(a.code) - qualityBitrate(b.code));
  return [...ordered, ...rest];
}

function qualityBitrate(code: string): number {
  const weights: Record<string, number> = {
    AI00: 999,
    Q000: 900,
    Q001: 880,
    Q003: 850,
    DT03: 820,
    D004: 810,
    TL01: 800,
    F000: 700,
    O801: 640,
    O800: 320,
    M800: 320,
    C600: 192,
    O600: 192,
    M500: 128,
    C400: 96,
    O400: 96,
    C200: 48
  };
  return weights[code] ?? 128;
}

function buildMediaUrl(purl: string, sip?: string[]): string {
  if (/^https?:\/\//i.test(purl)) return purl.replace(/^http:\/\//i, "https://");
  const host = sip?.find((item) => item.startsWith("https://")) ?? sip?.[0] ?? "https://isure.stream.qqmusic.qq.com/";
  const url = `${host}${purl}`;
  return url.replace(/^http:\/\//i, "https://");
}

function parseLyricDocument(trackId: string, data: unknown): LyricDocument {
  const record = data as any;
  const encryptedLyric = typeof record?.lyric === "string" ? record.lyric : "";
  const decrypted = record?.crypt === 1 && encryptedLyric ? qrcDecrypt(encryptedLyric) : encryptedLyric;
  const text =
    pickLyricText(decrypted) ??
    decrypted;
  const encryptedTranslation = typeof record?.trans === "string" ? record.trans : "";
  const decryptedTranslation = record?.crypt === 1 && encryptedTranslation
    ? qrcDecrypt(encryptedTranslation)
    : encryptedTranslation;
  const translationText = pickLyricText(decryptedTranslation) ?? decryptedTranslation;
  const lines = applyTranslations(parseLrcLines(text), parseLrcLines(translationText));
  return { trackId, rawLrc: text || undefined, lines, source: text ? (record?.crypt === 1 ? "qrc" : "lrc") : "none" };
}

function pickLyricText(value: string): string | undefined {
  const match = value.match(/LyricContent="([^"]*)"/);
  if (match) return unescapeXml(match[1]!);
  if (value.includes("[") || value.includes("{")) return value;
  return undefined;
}

function unescapeXml(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/\\n/g, "\n");
}

function parseLrcLines(text: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const qrcMatch = line.match(/^\[(\d+),(\d+)\](.*)$/);
    if (qrcMatch) {
      const startMs = Number(qrcMatch[1]);
      const durationMs = Number(qrcMatch[2]);
      const content = stripQrcInlineTags(qrcMatch[3] ?? "").trim();
      if (content && startMs >= 0) {
        lines.push({ startMs, endMs: durationMs > 0 ? startMs + durationMs : undefined, text: content });
      }
      continue;
    }
    const timestamps = [...line.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (timestamps.length === 0) continue;
    const content = stripQrcInlineTags(line.replace(/\[[^\]]*\]/g, "")).trim();
    for (const match of timestamps) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ? Number(match[3]!.padEnd(3, "0").slice(0, 3)) : 0;
      lines.push({ startMs: minutes * 60_000 + seconds * 1000 + fraction, text: content || "..." });
    }
  }
  lines.sort((a, b) => a.startMs - b.startMs);
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]!.endMs === undefined && i + 1 < lines.length) {
      lines[i]!.endMs = lines[i + 1]!.startMs;
    }
  }
  return lines;
}

function stripQrcInlineTags(value: string): string {
  return value
    .replace(/\(\d+,\d+\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function applyTranslations(lines: LyricLine[], translations: LyricLine[]): LyricLine[] {
  if (translations.length === 0) return lines;
  const map = new Map<number, string>();
  for (const translation of translations) map.set(translation.startMs, translation.text);
  return lines.map((line) => {
    const exact = map.get(line.startMs);
    if (exact) return { ...line, translation: exact };
    let nearest: { startMs: number; text: string } | undefined;
    for (const [startMs, text] of map) {
      if (Math.abs(startMs - line.startMs) <= 1_000) {
        if (!nearest || Math.abs(startMs - line.startMs) < Math.abs(nearest.startMs - line.startMs)) {
          nearest = { startMs, text };
        }
      }
    }
    return nearest ? { ...line, translation: nearest.text } : line;
  });
}
