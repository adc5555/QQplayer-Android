import { AuthApi } from "./api/auth.js";
import { SearchApi } from "./api/search.js";
import { SongApi } from "./api/song.js";
import { QqMusicClient } from "./client.js";
import { DownloadManager } from "./downloads.js";
import { FavoritesManager } from "./favorites.js";
import { DOWNLOADED_PLAYLIST_ID, type CoreOptions, type CoreService, type DownloadOptions, type DownloadTask } from "./types.js";

export function createCoreService(options: CoreOptions): CoreService {
  const platform = options.platform ?? "android";
  const client = new QqMusicClient({
    platform,
    dataDir: options.dataDir,
    fetchImpl: options.fetch
  });
  const auth = new AuthApi(client);
  const search = new SearchApi(client, platform);
  const song = new SongApi(client);
  const downloads = new DownloadManager(client, options.dataDir, options.fetch ?? globalThis.fetch);
  const favorites = new FavoritesManager(options.dataDir);
  downloads.setOnCompleted(async (task) => {
    await favorites.addTrack(DOWNLOADED_PLAYLIST_ID, task.track);
  });

  return {
    auth: {
      getStatus: () => auth.getStatus(),
      startQrLogin: () => auth.startQrLogin(),
      pollQrLogin: () => auth.pollQrLogin(),
      importCredential: () => auth.importCredential(),
      logout: () => auth.logout()
    },
    catalog: {
      search: (keyword, page, pageSize) => search.search(keyword, page, pageSize),
      getTrack: (trackId) => song.getTrack(trackId)
    },
    media: {
      resolveUrl: async (trackId, preferredQuality) => {
        const local = downloads.getLocalMediaUrl(trackId);
        if (local) {
          return { trackId, quality: local.quality, url: local.url };
        }
        return song.resolveUrl(trackId, preferredQuality);
      },
      getLyrics: async (trackId) => {
        const local = await downloads.getLocalLyrics(trackId);
        if (local) return local;
        return song.getLyrics(trackId);
      }
    },
    downloads: {
      create: (trackId, qualityCode, targetPath, options?: DownloadOptions) => downloads.create(trackId, qualityCode, targetPath, options),
      pause: (taskId) => downloads.pause(taskId),
      resume: (taskId) => downloads.resume(taskId),
      cancel: (taskId) => downloads.cancel(taskId),
      list: () => downloads.list(),
      clear: () => downloads.clear(),
      getDirectory: () => downloads.getDirectory(),
      setDirectory: (directory) => downloads.setDirectory(directory),
      syncDownloaded: () => downloads.syncDownloadedPlaylist(
        async (track) => { await favorites.addTrack(DOWNLOADED_PLAYLIST_ID, track); },
        async (trackId) => { await favorites.removeTrack(DOWNLOADED_PLAYLIST_ID, trackId); }
      ),
      removeDownloadedTrack: async (trackId) => {
        await downloads.removeLocalFile(trackId);
        await favorites.removeTrack(DOWNLOADED_PLAYLIST_ID, trackId);
      }
    },
    favorites: {
      listPlaylists: () => favorites.listPlaylists(),
      createPlaylist: (name) => favorites.createPlaylist(name),
      renamePlaylist: (playlistId, name) => favorites.renamePlaylist(playlistId, name),
      deletePlaylist: (playlistId) => favorites.deletePlaylist(playlistId),
      addTrack: (playlistId, track) => favorites.addTrack(playlistId, track),
      removeTrack: (playlistId, trackId) => favorites.removeTrack(playlistId, trackId)
    },
    warmup: async () => {
      await downloads.syncDownloadedPlaylist(
        async (track) => { await favorites.addTrack(DOWNLOADED_PLAYLIST_ID, track); },
        async (trackId) => { await favorites.removeTrack(DOWNLOADED_PLAYLIST_ID, trackId); }
      );
      await client.warmup();
    },
    dispose: async () => {
      await downloads.dispose();
    }
  };
}

export type { DownloadTask };
