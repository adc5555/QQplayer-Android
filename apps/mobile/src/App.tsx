import { useEffect, useRef, useState } from "react";
import type { CoreService, DownloadTask, FavoritePlaylist, SearchPage, Track } from "@qqplayer/core";
import { formatTime, usePlayer } from "@qqplayer/ui";

type Tab = "search" | "now" | "favorites" | "downloads" | "settings";

const service = createBridgeService();

export function App() {
  const player = usePlayer(service);
  const [tab, setTab] = useState<Tab>("search");
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("qqplayer-theme");
    return saved === "light" ? "light" : "dark";
  });
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<FavoritePlaylist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [playlistDialog, setPlaylistDialog] = useState<null | { mode: "create" } | { mode: "rename"; playlistId: string; name: string }>(null);
  const [dialogName, setDialogName] = useState("");
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [downloadDir, setDownloadDir] = useState("");
  const lyricsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("qqplayer-theme", theme);
  }, [theme]);

  useEffect(() => {
    void refreshFavorites();
    void refreshDownloads();
    void loadDownloadDir();
  }, []);

  useEffect(() => {
    if (tab !== "downloads") return;
    const timer = window.setInterval(() => void refreshDownloads(), 1200);
    return () => window.clearInterval(timer);
  }, [tab]);

  useEffect(() => {
    if (tab !== "now" || !player.lyrics) return;
    const container = lyricsRef.current;
    if (!container) return;
    const activeLines = container.querySelectorAll<HTMLElement>(".mobile-lyric-line.active");
    const active = activeLines[activeLines.length - 1];
    if (!active) return;
    const top = active.offsetTop - container.clientHeight / 2 + active.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [tab, player.currentTimeSec, player.lyrics]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function search() {
    const trimmed = keyword.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const page = await service.catalog.search(trimmed, 1, 30);
      setResults(page.tracks);
    } catch (cause) {
      setResults([]);
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshFavorites() {
    const list = await service.favorites.listPlaylists();
    setFavorites(list);
    if (list.length > 0 && (!selectedPlaylistId || !list.some((item) => item.id === selectedPlaylistId))) {
      setSelectedPlaylistId(list[0]!.id);
    }
  }

  async function refreshDownloads() {
    setDownloads(await service.downloads.list());
  }

  async function loadDownloadDir() {
    setDownloadDir(await service.downloads.getDirectory());
  }

  async function downloadTrack(track: Track) {
    try {
      await service.downloads.create(track.mid || track.id, "M500");
      await refreshDownloads();
      setToast("已开始下载");
    } catch (cause) {
      setToast((cause as Error).message);
    }
  }

  async function addToFavorites(track: Track) {
    try {
      const playlistId = await ensurePlaylist();
      await service.favorites.addTrack(playlistId, track);
      await refreshFavorites();
      setToast("已添加到收藏夹");
    } catch (cause) {
      setToast((cause as Error).message);
    }
  }

  async function ensurePlaylist(): Promise<string> {
    if (favorites.length > 0) {
      const id = selectedPlaylistId && favorites.some((item) => item.id === selectedPlaylistId)
        ? selectedPlaylistId
        : favorites[0]!.id;
      setSelectedPlaylistId(id);
      return id;
    }
    const created = await service.favorites.createPlaylist("我的收藏");
    setFavorites([created]);
    setSelectedPlaylistId(created.id);
    return created.id;
  }

  async function submitPlaylistDialog() {
    const name = dialogName.trim();
    if (!playlistDialog || !name) return;
    try {
      if (playlistDialog.mode === "create") {
        const created = await service.favorites.createPlaylist(name);
        setSelectedPlaylistId(created.id);
      } else {
        await service.favorites.renamePlaylist(playlistDialog.playlistId, name);
      }
      await refreshFavorites();
      setPlaylistDialog(null);
      setDialogName("");
      setToast("收藏夹已保存");
    } catch (cause) {
      setToast((cause as Error).message);
    }
  }

  async function deletePlaylist(playlistId: string) {
    try {
      await service.favorites.deletePlaylist(playlistId);
      setSelectedPlaylistId(null);
      await refreshFavorites();
      setToast("收藏夹已删除");
    } catch (cause) {
      setToast((cause as Error).message);
    }
  }

  async function removeFromFavorites(trackId: string) {
    if (!selectedPlaylistId) return;
    try {
      await service.favorites.removeTrack(selectedPlaylistId, trackId);
      await refreshFavorites();
      setToast("已从收藏夹移除");
    } catch (cause) {
      setToast((cause as Error).message);
    }
  }

  async function saveDownloadDir() {
    try {
      await service.downloads.setDirectory(downloadDir.trim());
      await loadDownloadDir();
      setToast("下载目录已更新");
    } catch (cause) {
      setToast((cause as Error).message);
    }
  }

  async function pauseDownload(taskId: string) {
    await service.downloads.pause(taskId);
    await refreshDownloads();
  }

  async function resumeDownload(taskId: string) {
    await service.downloads.resume(taskId);
    await refreshDownloads();
  }

  async function cancelDownload(taskId: string) {
    await service.downloads.cancel(taskId);
    await refreshDownloads();
  }

  async function clearDownloads() {
    await service.downloads.clear();
    await refreshDownloads();
    setToast("下载列表已清空");
  }

  async function downloadPlaylist() {
    if (!selectedPlaylist || selectedPlaylist.tracks.length === 0) return;
    try {
      for (const track of selectedPlaylist.tracks) {
        await service.downloads.create(track.mid || track.id, "M500");
      }
      await refreshDownloads();
      setToast(`已将 ${selectedPlaylist.tracks.length} 首加入下载队列`);
    } catch (cause) {
      setToast((cause as Error).message);
    }
  }

  const selectedPlaylist = favorites.find((item) => item.id === selectedPlaylistId) ?? null;

  return (
    <div className="mobile-app">
      <main className="mobile-main">
        {tab === "search" && (
          <section className="mobile-page">
            <div className="mobile-search">
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void search();
                }}
                placeholder="搜索歌曲、歌手"
              />
              <button onClick={() => void search()} disabled={loading || !keyword.trim()}>
                {loading ? "搜索中..." : "搜索"}
              </button>
            </div>
            {error && <div className="mobile-notice error">{error}</div>}
            <div className="mobile-track-list">
              {results.map((track, index) => (
                <div key={track.mid || track.id} className="mobile-track-row" onClick={() => void player.playQueue(results, index)}>
                  <img src={track.coverUrl} alt="" />
                  <div className="mobile-track-info">
                    <strong>{track.title}</strong>
                    <span>{track.artists.map((artist) => artist.name).join(" / ")} · {track.album.name}</span>
                  </div>
                  <span>{track.durationSec ? formatTime(track.durationSec) : ""}</span>
                  <div className="mobile-track-actions">
                    <button onClick={(event) => { event.stopPropagation(); void player.playNext(track); }}>⏭</button>
                    <button onClick={(event) => { event.stopPropagation(); void downloadTrack(track); }}>↓</button>
                    <button onClick={(event) => { event.stopPropagation(); void addToFavorites(track); }}>☆</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "now" && (
          <section className="mobile-page mobile-now">
            {player.currentTrack ? (
              <>
                <div className="mobile-now-header">
                  <img src={player.currentTrack.coverUrl} alt="" />
                  <div>
                    <h2>{player.currentTrack.title}</h2>
                    <p>{player.currentTrack.artists.map((artist) => artist.name).join(" / ")}</p>
                  </div>
                </div>
                <div className="mobile-lyrics" ref={lyricsRef}>
                  {player.lyrics?.lines.map((line) => (
                    <div
                      key={`${line.startMs}-${line.text}`}
                      className={`mobile-lyric-line ${line.startMs <= player.currentTimeSec * 1000 ? "active" : ""}`}
                      onClick={() => player.seek(line.startMs / 1000)}
                    >
                      <span>{line.text}</span>
                      {line.translation && <small>{line.translation}</small>}
                    </div>
                  ))}
                </div>
                <div className="mobile-player-controls">
                  <button onClick={() => void player.previous()}>⏮</button>
                  <button className="mobile-play" onClick={() => void player.toggle()}>{player.isPlaying ? "❚❚" : "▶"}</button>
                  <button onClick={() => void player.next()}>⏭</button>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, player.durationSec)}
                  value={Math.min(player.currentTimeSec, player.durationSec)}
                  onChange={(event) => player.seek(Number(event.target.value))}
                />
                <div className="mobile-time">{formatTime(player.currentTimeSec)} / {formatTime(player.durationSec)}</div>
                <div className="mobile-loop-switcher">
                  <button className={player.loopMode === "none" ? "active" : ""} onClick={() => player.setLoopMode("none")}>顺序</button>
                  <button className={player.loopMode === "all" ? "active" : ""} onClick={() => player.setLoopMode("all")}>列表循环</button>
                  <button className={player.loopMode === "one" ? "active" : ""} onClick={() => player.setLoopMode("one")}>单曲循环</button>
                  <button className={player.shuffle ? "active" : ""} onClick={player.toggleShuffle}>随机</button>
                </div>
                <div className="mobile-queue">
                  <h3>播放列表</h3>
                  {player.queue.map((track, index) => (
                    <div key={`${track.mid || track.id}-${index}`} className="mobile-queue-row" onClick={() => void player.playQueue(player.queue, index)}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{track.title}</strong>
                        <span>{track.artists.map((artist) => artist.name).join(" / ")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mobile-empty">选择一首歌开始播放</div>
            )}
          </section>
        )}

        {tab === "favorites" && (
          <section className="mobile-page">
            <div className="mobile-page-header">
              <h2>收藏夹</h2>
              <button onClick={() => { setPlaylistDialog({ mode: "create" }); setDialogName(""); }}>新建</button>
            </div>
            <div className="mobile-playlist-list">
              {favorites.map((playlist) => (
                <div key={playlist.id} className={`mobile-playlist ${playlist.id === selectedPlaylistId ? "active" : ""}`}>
                  <button className="mobile-playlist-main" onClick={() => setSelectedPlaylistId(playlist.id)}>
                    <strong>{playlist.name}</strong>
                    <span>{playlist.tracks.length} 首</span>
                  </button>
                  <button onClick={() => { setPlaylistDialog({ mode: "rename", playlistId: playlist.id, name: playlist.name }); setDialogName(playlist.name); }}>改名</button>
                  <button onClick={() => void deletePlaylist(playlist.id)}>删除</button>
                </div>
              ))}
            </div>
            {selectedPlaylist && (
              <>
                <div className="mobile-page-header">
                  <h3>{selectedPlaylist.name}</h3>
                  <div className="mobile-page-header-actions">
                    <button onClick={() => void player.playQueue(selectedPlaylist.tracks, 0)}>播放全部</button>
                    <button onClick={() => void downloadPlaylist()}>下载全部</button>
                  </div>
                </div>
                <div className="mobile-track-list">
                {selectedPlaylist.tracks.map((track, index) => (
                  <div key={track.mid || track.id} className="mobile-track-row" onClick={() => void player.playQueue(selectedPlaylist.tracks, index)}>
                    <img src={track.coverUrl} alt="" />
                    <div className="mobile-track-info">
                      <strong>{track.title}</strong>
                      <span>{track.artists.map((artist) => artist.name).join(" / ")}</span>
                    </div>
                    <div className="mobile-track-actions">
                      <button onClick={(event) => { event.stopPropagation(); void player.playNext(track); }}>⏭</button>
                      <button onClick={(event) => { event.stopPropagation(); void downloadTrack(track); }}>↓</button>
                      <button onClick={(event) => { event.stopPropagation(); void removeFromFavorites(track.id || track.mid); }}>✕</button>
                    </div>
                  </div>
                ))}
                </div>
              </>
            )}
          </section>
        )}

        {tab === "downloads" && (
          <section className="mobile-page">
            <div className="mobile-page-header">
              <h2>下载</h2>
              <button onClick={() => void clearDownloads()}>清空列表</button>
            </div>
            <div className="mobile-dir">
              <input value={downloadDir} onChange={(event) => setDownloadDir(event.target.value)} placeholder="下载目录" />
              <button onClick={() => void saveDownloadDir()}>保存</button>
            </div>
            <div className="mobile-download-list">
              {downloads.map((task) => (
                <div className="mobile-download-item" key={task.id}>
                  <img src={task.track.coverUrl} alt="" />
                  <div className="mobile-download-info">
                    <strong>{task.track.title}</strong>
                    <span>{statusText(task.status)} · {formatBytes(task.receivedBytes)}</span>
                    <div className="mobile-download-progress"><div style={{ width: `${progressPercent(task)}%` }} /></div>
                  </div>
                  <div className="mobile-download-actions">
                    {task.status === "downloading" && <button onClick={() => void pauseDownload(task.id)}>暂停</button>}
                    {(task.status === "paused" || task.status === "failed") && <button onClick={() => void resumeDownload(task.id)}>继续</button>}
                    {(task.status === "downloading" || task.status === "paused" || task.status === "queued") && <button onClick={() => void cancelDownload(task.id)}>取消</button>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "settings" && (
          <section className="mobile-page">
            <h2>设置</h2>
            <button className="mobile-setting-row" onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")}>
              {theme === "dark" ? "🌙 暗色模式" : "☀️ 亮色模式"}
            </button>
          </section>
        )}
      </main>

      <footer className="mobile-tabs">
        <button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}>搜索</button>
        <button className={tab === "now" ? "active" : ""} onClick={() => setTab("now")}>正在播放</button>
        <button className={tab === "favorites" ? "active" : ""} onClick={() => setTab("favorites")}>收藏</button>
        <button className={tab === "downloads" ? "active" : ""} onClick={() => setTab("downloads")}>下载</button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>设置</button>
      </footer>

      {playlistDialog && (
        <div className="mobile-modal-backdrop" onClick={() => setPlaylistDialog(null)}>
          <div className="mobile-modal" onClick={(event) => event.stopPropagation()}>
            <h2>{playlistDialog.mode === "create" ? "新建收藏夹" : "重命名收藏夹"}</h2>
            <input value={dialogName} onChange={(event) => setDialogName(event.target.value)} placeholder="收藏夹名称" />
            <div>
              <button onClick={() => setPlaylistDialog(null)}>取消</button>
              <button onClick={() => void submitPlaylistDialog()}>保存</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="mobile-toast">{toast}</div>}
      {player.error && <div className="mobile-toast error">{player.error}</div>}
    </div>
  );
}

function progressPercent(task: DownloadTask): number {
  if (!task.totalBytes) return task.status === "completed" ? 100 : 0;
  return Math.min(100, (task.receivedBytes / task.totalBytes) * 100);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

function statusText(status: DownloadTask["status"]): string {
  switch (status) {
    case "queued": return "等待中";
    case "downloading": return "下载中";
    case "paused": return "已暂停";
    case "completed": return "已完成";
    case "failed": return "失败";
    case "canceled": return "已取消";
  }
}

function createBridgeService(): CoreService {
  const call = (method: string, params?: unknown) => window.QQPlayerBridge?.call(method, params);
  return {
    auth: {
      getStatus: () => call("auth.getStatus") as Promise<any>,
      startQrLogin: () => call("auth.startQrLogin") as never,
      pollQrLogin: () => call("auth.pollQrLogin") as never,
      importCredential: () => call("auth.importCredential") as never,
      logout: () => call("auth.logout") as Promise<void>
    },
    catalog: {
      search: (keyword, page, pageSize) => call("catalog.search", { keyword, page, pageSize }) as Promise<SearchPage>,
      getTrack: (trackId) => call("catalog.getTrack", { trackId }) as Promise<Track>
    },
    media: {
      resolveUrl: (trackId, quality) => call("media.resolveUrl", { trackId, quality }) as Promise<any>,
      getLyrics: (trackId) => call("media.getLyrics", { trackId }) as Promise<any>
    },
    downloads: {
      create: (trackId, quality, targetPath) => call("downloads.create", { trackId, quality, targetPath }) as Promise<any>,
      pause: (taskId) => call("downloads.pause", { taskId }) as Promise<any>,
      resume: (taskId) => call("downloads.resume", { taskId }) as Promise<any>,
      cancel: (taskId) => call("downloads.cancel", { taskId }) as Promise<any>,
      list: () => call("downloads.list") as Promise<any[]>,
      clear: () => call("downloads.clear") as Promise<void>,
      getDirectory: () => call("downloads.getDirectory") as Promise<string>,
      setDirectory: (directory) => call("downloads.setDirectory", { directory }) as Promise<void>
    },
    favorites: {
      listPlaylists: () => call("favorites.listPlaylists") as Promise<FavoritePlaylist[]>,
      createPlaylist: (name) => call("favorites.createPlaylist", { name }) as Promise<FavoritePlaylist>,
      renamePlaylist: (playlistId, name) => call("favorites.renamePlaylist", { playlistId, name }) as Promise<FavoritePlaylist>,
      deletePlaylist: (playlistId) => call("favorites.deletePlaylist", { playlistId }) as Promise<void>,
      addTrack: (playlistId, track) => call("favorites.addTrack", { playlistId, track }) as Promise<FavoritePlaylist>,
      removeTrack: (playlistId, trackId) => call("favorites.removeTrack", { playlistId, trackId }) as Promise<FavoritePlaylist>
    },
    warmup: () => call("warmup") as Promise<void>,
    dispose: async () => {}
  };
}
