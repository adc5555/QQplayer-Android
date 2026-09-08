import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CoreError, CoreErrorCode } from "./errors.js";
import { DOWNLOADED_PLAYLIST_ID, type FavoritePlaylist, type Track } from "./types.js";

export class FavoritesManager {
  private playlists: FavoritePlaylist[] = [];
  private readonly storePath: string;

  constructor(dataDir: string) {
    this.storePath = join(dataDir, "favorites.json");
    this.load();
    this.ensureDownloadedPlaylist();
  }

  async listPlaylists(): Promise<FavoritePlaylist[]> {
    return this.playlists.map((playlist) => this.clonePlaylist(playlist));
  }

  async createPlaylist(name: string): Promise<FavoritePlaylist> {
    const normalized = normalizeName(name);
    const now = Date.now();
    const playlist: FavoritePlaylist = {
      id: randomUUID(),
      name: normalized,
      tracks: [],
      createdAtMs: now,
      updatedAtMs: now
    };
    this.playlists.push(playlist);
    this.save();
    return this.clonePlaylist(playlist);
  }

  async renamePlaylist(playlistId: string, name: string): Promise<FavoritePlaylist> {
    const playlist = this.requirePlaylist(playlistId);
    playlist.name = normalizeName(name);
    playlist.updatedAtMs = Date.now();
    this.save();
    return this.clonePlaylist(playlist);
  }

  async deletePlaylist(playlistId: string): Promise<void> {
    if (playlistId === DOWNLOADED_PLAYLIST_ID) {
      throw new CoreError(CoreErrorCode.INVALID_ARGUMENT, "宸蹭笅杞芥敹钘忓す涓嶈兘鍒犻櫎");
    }
    const index = this.playlists.findIndex((playlist) => playlist.id === playlistId);
    if (index < 0) throw new CoreError(CoreErrorCode.NOT_FOUND, "收藏夹不存在");
    this.playlists.splice(index, 1);
    this.save();
  }

  async addTrack(playlistId: string, track: Track): Promise<FavoritePlaylist> {
    const playlist = this.requirePlaylist(playlistId);
    if (!playlist.tracks.some((item) => item.mid === track.mid || item.id === track.id)) {
      playlist.tracks.push({ ...track });
      playlist.updatedAtMs = Date.now();
      this.save();
    }
    return this.clonePlaylist(playlist);
  }

  async removeTrack(playlistId: string, trackId: string): Promise<FavoritePlaylist> {
    const playlist = this.requirePlaylist(playlistId);
    playlist.tracks = playlist.tracks.filter((track) => track.id !== trackId && track.mid !== trackId);
    playlist.updatedAtMs = Date.now();
    this.save();
    return this.clonePlaylist(playlist);
  }

  private requirePlaylist(playlistId: string): FavoritePlaylist {
    const playlist = this.playlists.find((item) => item.id === playlistId);
    if (!playlist) throw new CoreError(CoreErrorCode.NOT_FOUND, "收藏夹不存在");
    return playlist;
  }

  private load(): void {
    try {
      const raw = JSON.parse(readFileSync(this.storePath, "utf-8")) as FavoritePlaylist[];
      this.playlists = Array.isArray(raw) ? raw.map((playlist) => ({
        ...playlist,
        tracks: Array.isArray(playlist.tracks) ? playlist.tracks : []
      })) : [];
    } catch {
      this.playlists = [];
    }
  }

  private ensureDownloadedPlaylist(): void {
    if (this.playlists.some((playlist) => playlist.id === DOWNLOADED_PLAYLIST_ID)) return;
    const now = Date.now();
    this.playlists.unshift({
      id: DOWNLOADED_PLAYLIST_ID,
      name: "已下载",
      tracks: [],
      createdAtMs: now,
      updatedAtMs: now
    });
    this.save();
  }

  private save(): void {
    mkdirSync(dirname(this.storePath), { recursive: true });
    const temp = `${this.storePath}.tmp`;
    writeFileSync(temp, `${JSON.stringify(this.playlists, null, 2)}\n`, "utf-8");
    renameSync(temp, this.storePath);
  }

  private clonePlaylist(playlist: FavoritePlaylist): FavoritePlaylist {
    return {
      ...playlist,
      tracks: playlist.tracks.map((track) => ({ ...track }))
    };
  }
}

function normalizeName(name: string): string {
  const value = name.trim().replace(/\s+/g, " ");
  if (!value) throw new CoreError(CoreErrorCode.INVALID_ARGUMENT, "收藏夹名称不能为空");
  return value.slice(0, 40);
}
