import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { CoreError, CoreErrorCode } from "./errors.js";
import { sanitizeForFilename } from "./utils/common.js";
import { DOWNLOADED_PLAYLIST_ID, type DownloadOptions, type DownloadTask, type LyricDocument, type Track } from "./types.js";
import type { QqMusicClient } from "./client.js";

interface PersistedTask extends DownloadTask {
  finalPath?: string;
  includeLyrics?: boolean;
  includeTranslation?: boolean;
}

export class DownloadManager {
  private readonly tasks = new Map<string, PersistedTask>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly storePath: string;
  private readonly settingsPath: string;
  private downloadDir: string;
  private localServer = createServer((req, res) => void this.handleLocalRequest(req, res));
  private localServerPort = 0;
  private onCompleted?: (task: DownloadTask) => Promise<void>;
  private running = 0;
  private disposed = false;

  constructor(
    private readonly client: QqMusicClient,
    private readonly dataDir: string,
    private readonly fetchImpl = globalThis.fetch,
    private readonly maxConcurrent = 2
  ) {
    this.storePath = join(dataDir, "downloads.json");
    this.settingsPath = join(dataDir, "downloads-settings.json");
    this.downloadDir = join(dataDir, "downloads");
    this.load();
    this.loadSettings();
    this.startLocalServer();
  }

  async create(trackId: string, qualityCode?: string, targetPath?: string, options: DownloadOptions = {}): Promise<DownloadTask> {
    const resolved = await this.clientRequest(trackId, qualityCode);
    const track = resolved.track;
    const finalPath = targetPath ?? this.defaultPath(track, resolved.quality.ext);
    const task: PersistedTask = {
      id: randomUUID(),
      trackId,
      track,
      quality: resolved.quality,
      status: "queued",
      receivedBytes: 0,
      totalBytes: 0,
      filePath: finalPath,
      finalPath,
      includeLyrics: options.includeLyrics ?? false,
      includeTranslation: options.includeTranslation ?? false,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now()
    };
    this.tasks.set(task.id, task);
    this.save();
    this.schedule();
    return publicTask(task);
  }

  async pause(taskId: string): Promise<DownloadTask> {
    const task = this.requireTask(taskId);
    if (task.status === "downloading" || task.status === "queued") {
      this.controllers.get(taskId)?.abort(new Error("paused"));
      this.controllers.delete(taskId);
      task.status = "paused";
      task.updatedAtMs = Date.now();
      this.save();
    }
    return publicTask(task);
  }

  async resume(taskId: string): Promise<DownloadTask> {
    const task = this.requireTask(taskId);
    if (task.status === "paused" || task.status === "failed") {
      task.status = "queued";
      task.updatedAtMs = Date.now();
      this.save();
      this.schedule();
    }
    return publicTask(task);
  }

  async cancel(taskId: string): Promise<DownloadTask> {
    const task = this.requireTask(taskId);
    if (task.status === "downloading" || task.status === "queued") {
      this.controllers.get(taskId)?.abort(new Error("canceled"));
      this.controllers.delete(taskId);
    }
    const part = `${task.filePath}.part`;
    if (task.filePath && existsSync(part)) {
      try {
        unlinkSync(part);
      } catch {
        // 清理失败不阻断取消结果
      }
    }
    task.status = "canceled";
    task.updatedAtMs = Date.now();
    this.save();
    return publicTask(task);
  }

  async list(): Promise<DownloadTask[]> {
    return [...this.tasks.values()].sort((a, b) => b.createdAtMs - a.createdAtMs).map(publicTask);
  }

  async clear(): Promise<void> {
    for (const controller of this.controllers.values()) controller.abort(new Error("cleared"));
    this.controllers.clear();
    this.tasks.clear();
    this.save();
  }

  async getDirectory(): Promise<string> {
    return this.downloadDir;
  }

  async setDirectory(directory: string): Promise<void> {
    const normalized = directory.trim();
    if (!normalized) throw new CoreError(CoreErrorCode.INVALID_ARGUMENT, "下载目录不能为空");
    this.downloadDir = normalized;
    this.saveSettings();
  }

  setOnCompleted(callback: (task: DownloadTask) => Promise<void>): void {
    this.onCompleted = callback;
  }

  getLocalMediaUrl(trackId: string): { url: string; quality: DownloadTask["quality"] } | null {
    const task = this.findCompletedTask(trackId);
    if (!task?.filePath || !existsSync(task.filePath)) return null;
    return {
      url: `http://127.0.0.1:${this.localServerPort}/audio?trackId=${encodeURIComponent(trackId)}`,
      quality: task.quality
    };
  }

  async getLocalLyrics(trackId: string): Promise<LyricDocument | null> {
    const task = this.findCompletedTask(trackId);
    const path = task?.lyricsPath ?? this.sidecarPath(task);
    if (!path || !existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as LyricDocument;
    } catch {
      return null;
    }
  }

  async removeLocalFile(trackId: string): Promise<void> {
    const task = this.findTask(trackId);
    if (!task) return;
    const part = `${task.filePath}.part`;
    for (const path of [task.filePath, part, task.lyricsPath]) {
      if (path && existsSync(path)) {
        try {
          unlinkSync(path);
        } catch {
          // 鍒犻櫎澶辫触鏃惰繕鏄Щ闄や笅杞戒换鍔★紝閬垮厤鍒楄〃鍙嶅
        }
      }
    }
    this.tasks.delete(task.id);
    this.save();
  }

  async syncDownloadedPlaylist(
    addTrack: (track: Track) => Promise<void>,
    removeTrack: (trackId: string) => Promise<void>
  ): Promise<void> {
    const completed = [...this.tasks.values()].filter((task) => task.status === "completed");
    for (const task of completed) {
      if (task.filePath && existsSync(task.filePath)) {
        await addTrack(task.track);
      } else {
        this.tasks.delete(task.id);
        await removeTrack(task.trackId);
      }
    }
    this.save();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const controller of this.controllers.values()) controller.abort(new Error("disposed"));
    await new Promise<void>((resolve) => this.localServer.close(() => resolve()));
  }

  private startLocalServer(): void {
    this.localServer.on("error", (error) => {
      // 鏈湴濯掍綋鏈嶅姟鍣ㄥ惎鍔ㄥけ璐ヤ笉闃绘柇涓嬭浇锛岀綉缁滄挱鏀惧皢鍥為€€鍒拌繙绋嬨€?
      console.error("local media server error", error);
    });
    this.localServer.listen(0, "127.0.0.1", () => {
      const address = this.localServer.address();
      this.localServerPort = typeof address === "object" && address ? address.port : 0;
    });
  }

  private async handleLocalRequest(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    try {
      if (url.pathname === "/audio") {
        const trackId = url.searchParams.get("trackId") ?? "";
        const task = this.findCompletedTask(trackId);
        if (!task?.filePath || !existsSync(task.filePath)) {
          res.writeHead(404).end();
          return;
        }
        await this.streamAudio(task.filePath, req, res);
        return;
      }
      if (url.pathname === "/lyrics") {
        const trackId = url.searchParams.get("trackId") ?? "";
        const lyrics = await this.getLocalLyrics(trackId);
        if (!lyrics) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(lyrics));
        return;
      }
      res.writeHead(404).end();
    } catch (cause) {
      res.writeHead(500).end((cause as Error).message);
    }
  }

  private streamAudio(filePath: string, req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): Promise<void> {
    return new Promise((resolve) => {
      const size = statSync(filePath).size;
      const range = req.headers.range;
      let start = 0;
      let end = size - 1;
      if (range) {
        const match = /bytes=(\d*)-(\d*)/.exec(range);
        if (match) {
          start = match[1] ? Number(match[1]) : 0;
          end = match[2] ? Number(match[2]) : size - 1;
          if (end >= size) end = size - 1;
        }
      }
      const contentLength = end - start + 1;
      const headers: Record<string, string | number> = {
        "Content-Type": contentType(filePath),
        "Accept-Ranges": "bytes",
        "Content-Length": contentLength
      };
      if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
      res.writeHead(range ? 206 : 200, headers);
      const stream = createReadStream(filePath, { start, end });
      stream.pipe(res);
      stream.on("end", () => resolve());
      stream.on("error", () => {
        res.destroy();
        resolve();
      });
    });
  }

  private findTask(trackId: string): PersistedTask | undefined {
    return [...this.tasks.values()].find((task) =>
      task.trackId === trackId || task.track.mid === trackId || task.track.id === trackId
    );
  }

  private findCompletedTask(trackId: string): PersistedTask | undefined {
    const task = this.findTask(trackId);
    return task?.status === "completed" ? task : undefined;
  }

  private sidecarPath(task?: PersistedTask): string | undefined {
    return task?.filePath ? `${task.filePath}.lyrics.json` : undefined;
  }

  private async writeLyricsSidecar(task: PersistedTask): Promise<void> {
    const { SongApi } = await import("./api/song.js");
    const api = new SongApi(this.client);
    const lyric = await api.getLyrics(task.trackId);
    const value: LyricDocument = {
      ...lyric,
      lines: lyric.lines.map((line) => ({
        ...line,
        translation: task.includeTranslation ? line.translation : undefined
      }))
    };
    if (!task.includeLyrics && !task.includeTranslation) return;
    const path = this.sidecarPath(task);
    if (!path) return;
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
    task.lyricsPath = path;
    this.save();
  }

  private async clientRequest(trackId: string, qualityCode?: string): Promise<{ track: Track; url: string; quality: DownloadTask["quality"] }> {
    const media = await this.client.execute({
      module: "music.pf_song_detail_svr",
      method: "get_song_detail_yqq",
      param: /^\d+$/.test(trackId) ? { song_id: Number(trackId) } : { song_mid: trackId },
      platform: "web"
    });
    const { mapTrack } = await import("./api/song.js");
    const track = mapTrack((media as any)?.track_info);
    if (!track) throw new CoreError(CoreErrorCode.NOT_FOUND, "歌曲详情不存在");
    const resolved = await this.resolveUrl(trackId, track, qualityCode);
    return { track, ...resolved };
  }

  private async resolveUrl(trackId: string, track: Track, qualityCode?: string): Promise<{ url: string; quality: DownloadTask["quality"] }> {
    // 复用 SongApi 的解析结果，避免下载层独立维护 vkey 协议。
    const song = (await import("./api/song.js")).SongApi;
    const api = new song(this.client);
    const media = await api.resolveUrl(trackId, qualityCode);
    return { url: media.url, quality: media.quality };
  }

  private defaultPath(track: Track, ext: string): string {
    const dir = this.downloadDir;
    mkdirSync(dir, { recursive: true });
    const artist = track.artists[0]?.name ?? "未知歌手";
    const base = sanitizeForFilename(`${artist} - ${track.title}`) || "未命名歌曲";
    let candidate = join(dir, `${base}${ext}`);
    let index = 2;
    while (existsSync(candidate)) {
      candidate = join(dir, `${base} (${index})${ext}`);
      index += 1;
    }
    return candidate;
  }

  private schedule(): void {
    if (this.disposed) return;
    const available = this.maxConcurrent - this.running;
    if (available <= 0) return;
    const queued = [...this.tasks.values()].filter((task) => task.status === "queued").slice(0, available);
    for (const task of queued) {
      this.running += 1;
      void this.runTask(task);
    }
  }

  private async runTask(task: PersistedTask): Promise<void> {
    try {
      const resolved = await this.resolveUrl(task.trackId, task.track, task.quality.code);
      task.quality = resolved.quality;
      task.status = "downloading";
      task.updatedAtMs = Date.now();
      this.save();
      await this.streamToFile(task, resolved.url, true);
      if (task.includeLyrics || task.includeTranslation) {
        try {
          await this.writeLyricsSidecar(task);
        } catch {
          // 姝岃瘝涓嬭浇澶辫触涓嶅奖鍝嶉煶棰戜笅杞藉畬鎴愮姸鎬?
          task.lyricsPath = undefined;
        }
      }
      if (this.onCompleted) {
        await this.onCompleted(publicTask(task));
      }
    } catch (cause) {
      if ((cause as Error).message === "paused") return;
      if ((cause as Error).message === "canceled") return;
      task.status = "failed";
      task.errorCode = isCore(cause) ? cause.code : CoreErrorCode.DOWNLOAD_FAILED;
      task.errorMessage = (cause as Error).message;
      task.updatedAtMs = Date.now();
      this.save();
    } finally {
      this.running -= 1;
      this.schedule();
    }
  }

  private async streamToFile(task: PersistedTask, url: string, allowRefresh: boolean): Promise<void> {
    const finalPath = task.filePath!;
    const partPath = `${finalPath}.part`;
    mkdirSync(dirname(finalPath), { recursive: true });
    let offset = 0;
    if (existsSync(partPath)) {
      try {
        offset = statSync(partPath).size;
      } catch {
        offset = 0;
      }
    }
    task.receivedBytes = offset;
    const controller = new AbortController();
    this.controllers.set(task.id, controller);
    const headers: Record<string, string> = {};
    if (offset > 0) headers.Range = `bytes=${offset}-`;

    try {
      const response = await this.fetchImpl(url, { headers, redirect: "follow", signal: controller.signal });
      if (response.status === 401 || response.status === 403) {
        controller.abort(new Error("expired"));
        if (allowRefresh) {
          const refreshed = await this.resolveUrl(task.trackId, task.track, task.quality.code);
          return this.streamToFile(task, refreshed.url, false);
        }
        throw new CoreError(CoreErrorCode.NO_PERMISSION, "媒体地址已过期或无权限");
      }
      if (!response.ok && response.status !== 206) {
        throw new CoreError(CoreErrorCode.HTTP, `下载失败: HTTP ${response.status}`, { statusCode: response.status });
      }
      if (response.status === 200 && offset > 0) {
        offset = 0;
        task.receivedBytes = 0;
      }
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength) task.totalBytes = offset + contentLength;
      const body = response.body;
      if (!body) throw new CoreError(CoreErrorCode.DOWNLOAD_FAILED, "响应没有可读流");
      const reader = body.getReader();
      const writer = createWriteStream(partPath, { flags: offset > 0 ? "a" : "w" });
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (controller.signal.aborted) break;
          await writeChunk(writer, value as Uint8Array);
          offset += (value as Uint8Array).byteLength;
          task.receivedBytes = offset;
          task.updatedAtMs = Date.now();
        }
      } finally {
        writer.end();
      }
      if (controller.signal.aborted) {
        if (controller.signal.reason?.message === "paused") {
          task.status = "paused";
        } else if (controller.signal.reason?.message === "canceled") {
          task.status = "canceled";
        }
        task.updatedAtMs = Date.now();
        this.save();
        throw controller.signal.reason ?? new Error("下载中断");
      }
      renameSync(partPath, finalPath);
      task.status = "completed";
      task.receivedBytes = offset;
      task.updatedAtMs = Date.now();
      this.save();
    } finally {
      this.controllers.delete(task.id);
    }
  }

  private requireTask(taskId: string): PersistedTask {
    const task = this.tasks.get(taskId);
    if (!task) throw new CoreError(CoreErrorCode.NOT_FOUND, "下载任务不存在");
    return task;
  }

  private load(): void {
    try {
      const raw = JSON.parse(readFileSync(this.storePath, "utf-8")) as PersistedTask[];
      for (const item of raw) {
        if (item.status === "downloading") item.status = "paused";
        this.tasks.set(item.id, item);
      }
    } catch {
      // 首次运行或文件损坏时从空列表开始
    }
  }

  private loadSettings(): void {
    try {
      const settings = JSON.parse(readFileSync(this.settingsPath, "utf-8")) as { downloadDir?: string };
      if (settings.downloadDir) this.downloadDir = settings.downloadDir;
    } catch {
      // 使用默认下载目录
    }
  }

  private saveSettings(): void {
    mkdirSync(dirname(this.settingsPath), { recursive: true });
    const temp = `${this.settingsPath}.tmp`;
    writeFileSync(temp, `${JSON.stringify({ downloadDir: this.downloadDir }, null, 2)}\n`, "utf-8");
    renameSync(temp, this.settingsPath);
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.storePath), { recursive: true });
      writeFileSync(this.storePath, JSON.stringify([...this.tasks.values()], null, 2), "utf-8");
    } catch (cause) {
      throw new CoreError(CoreErrorCode.FILE_SYSTEM, `保存下载记录失败: ${(cause as Error).message}`, { cause });
    }
  }
}

function publicTask(task: PersistedTask): DownloadTask {
  const { finalPath: _finalPath, ...value } = task;
  return value;
}

function writeChunk(stream: NodeJS.WritableStream, chunk: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    (stream as any).write(chunk, (error?: Error | null) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function isCore(value: unknown): value is CoreError {
  return value instanceof CoreError;
}

function contentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".mp3": return "audio/mpeg";
    case ".flac": return "audio/flac";
    case ".ogg": return "audio/ogg";
    case ".m4a": return "audio/mp4";
    case ".wav": return "audio/wav";
    default: return "application/octet-stream";
  }
}
