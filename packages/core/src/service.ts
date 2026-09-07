import { AuthApi } from "./api/auth.js";
import { SearchApi } from "./api/search.js";
import { SongApi } from "./api/song.js";
import { QqMusicClient } from "./client.js";
import { DownloadManager } from "./downloads.js";
import { FavoritesManager } from "./favorites.js";
import type { CoreOptions, CoreService, DownloadTask } from "./types.js";

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
      resolveUrl: (trackId, preferredQuality) => song.resolveUrl(trackId, preferredQuality),
      getLyrics: (trackId) => song.getLyrics(trackId)
    },
    downloads: {
      create: (trackId, qualityCode, targetPath) => downloads.create(trackId, qualityCode, targetPath),
      pause: (taskId) => downloads.pause(taskId),
      resume: (taskId) => downloads.resume(taskId),
      cancel: (taskId) => downloads.cancel(taskId),
      list: () => downloads.list(),
      clear: () => downloads.clear(),
      getDirectory: () => downloads.getDirectory(),
      setDirectory: (directory) => downloads.setDirectory(directory)
    },
    favorites: {
      listPlaylists: () => favorites.listPlaylists(),
      createPlaylist: (name) => favorites.createPlaylist(name),
      renamePlaylist: (playlistId, name) => favorites.renamePlaylist(playlistId, name),
      deletePlaylist: (playlistId) => favorites.deletePlaylist(playlistId),
      addTrack: (playlistId, track) => favorites.addTrack(playlistId, track),
      removeTrack: (playlistId, trackId) => favorites.removeTrack(playlistId, trackId)
    },
    warmup: () => client.warmup(),
    dispose: async () => {
      await downloads.dispose();
    }
  };
}

export type { DownloadTask };
