export type PlatformName = "android" | "desktop" | "web";

export interface Artist {
  id?: number;
  mid?: string;
  name: string;
}

export interface Album {
  id?: number;
  mid?: string;
  name: string;
  coverUrl?: string;
}

export interface AudioQuality {
  code: string;
  ext: string;
  label: string;
  mimeType: string;
}

export const AUDIO_QUALITIES: readonly AudioQuality[] = [
  { code: "AI00", ext: ".flac", label: "臻品母带", mimeType: "audio/flac" },
  { code: "Q000", ext: ".flac", label: "臻品音质", mimeType: "audio/flac" },
  { code: "F000", ext: ".flac", label: "SQ 无损", mimeType: "audio/flac" },
  { code: "O801", ext: ".ogg", label: "OGG 640", mimeType: "audio/ogg" },
  { code: "O800", ext: ".ogg", label: "OGG 320", mimeType: "audio/ogg" },
  { code: "O600", ext: ".ogg", label: "OGG 192", mimeType: "audio/ogg" },
  { code: "O400", ext: ".ogg", label: "OGG 96", mimeType: "audio/ogg" },
  { code: "M800", ext: ".mp3", label: "MP3 320", mimeType: "audio/mpeg" },
  { code: "M500", ext: ".mp3", label: "MP3 128", mimeType: "audio/mpeg" },
  { code: "C600", ext: ".m4a", label: "AAC 192", mimeType: "audio/mp4" },
  { code: "C400", ext: ".m4a", label: "AAC 96", mimeType: "audio/mp4" },
  { code: "C200", ext: ".m4a", label: "AAC 48", mimeType: "audio/mp4" }
];

export const DEFAULT_QUALITY_CODE = "M500";
export const DOWNLOADED_PLAYLIST_ID = "__downloaded__";

export function findQuality(code: string): AudioQuality | undefined {
  return AUDIO_QUALITIES.find((q) => q.code === code);
}

export interface Track {
  id: string;
  mid: string;
  title: string;
  subtitle?: string;
  artists: Artist[];
  album: Album;
  durationSec?: number;
  coverUrl?: string;
}

export interface SearchPage {
  keyword: string;
  page: number;
  tracks: Track[];
  hasMore: boolean;
}

export interface ResolvedMedia {
  trackId: string;
  quality: AudioQuality;
  url: string;
  expiresAtSec?: number;
}

export type LyricLineKind = "lrc" | "qrc";

export interface LyricLine {
  startMs: number;
  endMs?: number;
  text: string;
  translation?: string;
}

export interface LyricDocument {
  trackId: string;
  rawLrc?: string;
  lines: LyricLine[];
  source: "none" | "lrc" | "qrc";
}

export type DownloadStatus =
  | "queued"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "canceled";

export interface DownloadTask {
  id: string;
  trackId: string;
  track: Track;
  quality: AudioQuality;
  status: DownloadStatus;
  receivedBytes: number;
  totalBytes: number;
  filePath?: string;
  lyricsPath?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface DownloadOptions {
  includeLyrics?: boolean;
  includeTranslation?: boolean;
}

export interface FavoritePlaylist {
  id: string;
  name: string;
  tracks: Track[];
  createdAtMs: number;
  updatedAtMs: number;
}

export type AuthStatus =
  | { state: "logged_out" }
  | { state: "expired" }
  | { state: "logged_in"; musicId: string };

export interface CoreService {
  auth: {
    getStatus(): Promise<AuthStatus>;
    startQrLogin(): Promise<never>;
    pollQrLogin(): Promise<never>;
    importCredential(): Promise<never>;
    logout(): Promise<void>;
  };
  catalog: {
    search(keyword: string, page?: number, pageSize?: number): Promise<SearchPage>;
    getTrack(trackId: string): Promise<Track>;
  };
  media: {
    resolveUrl(trackId: string, preferredQuality?: string): Promise<ResolvedMedia>;
    getLyrics(trackId: string): Promise<LyricDocument>;
  };
  downloads: {
    create(trackId: string, qualityCode?: string, targetPath?: string, options?: DownloadOptions): Promise<DownloadTask>;
    pause(taskId: string): Promise<DownloadTask>;
    resume(taskId: string): Promise<DownloadTask>;
    cancel(taskId: string): Promise<DownloadTask>;
    list(): Promise<DownloadTask[]>;
    clear(): Promise<void>;
    getDirectory(): Promise<string>;
    setDirectory(directory: string): Promise<void>;
    syncDownloaded(): Promise<void>;
    removeDownloadedTrack(trackId: string): Promise<void>;
  };
  favorites: {
    listPlaylists(): Promise<FavoritePlaylist[]>;
    createPlaylist(name: string): Promise<FavoritePlaylist>;
    renamePlaylist(playlistId: string, name: string): Promise<FavoritePlaylist>;
    deletePlaylist(playlistId: string): Promise<void>;
    addTrack(playlistId: string, track: Track): Promise<FavoritePlaylist>;
    removeTrack(playlistId: string, trackId: string): Promise<FavoritePlaylist>;
  };
  warmup(): Promise<void>;
  dispose(): Promise<void>;
}

export interface CoreOptions {
  platform?: PlatformName;
  dataDir: string;
  fetch?: typeof globalThis.fetch;
}
