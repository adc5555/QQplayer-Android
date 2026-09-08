import { useEffect, useRef, useState } from "react";
import type { CoreService, DownloadTask, FavoritePlaylist, SearchPage, Track } from "@qqplayer/core";
import { formatTime, usePlayer } from "@qqplayer/ui";

const service = createDesktopService();

type Page = "search" | "lyrics" | "favorites" | "downloads" | "playlist";

export function App() {
  const player = usePlayer(service);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("qqplayer-theme");
    return saved === "light" ? "light" : "dark";
  });
  const [closeBehavior, setCloseBehavior] = useState<"tray" | "quit">("tray");
  const [page, setPage] = useState<Page>("search");
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showVolume, setShowVolume] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<FavoritePlaylist[]>([]);
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [downloadDir, setDownloadDir] = useState("");
  const [downloadLyrics, setDownloadLyrics] = useState(true);
  const [downloadTranslation, setDownloadTranslation] = useState(true);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [playlistDialog, setPlaylistDialog] = useState<null | { mode: "create" } | { mode: "rename"; playlistId: string; name: string }>(null);
  const [dialogName, setDialogName] = useState("");
  const lyricsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("qqplayer-theme", theme);
    void window.qqplayer.window.setTitleBarTheme(theme);
  }, [theme]);

  useEffect(() => {
    void window.qqplayer.settings.getCloseBehavior().then(setCloseBehavior);
  }, []);

  async function search() {
    const trimmed = keyword.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setSearchError(null);
    try {
      const result = (await window.qqplayer.catalog.search(trimmed, 1, 30)) as SearchPage;
      setResults(result.tracks);
    } catch (error) {
      setResults([]);
      setSearchError((error as Error).message || "搜索失败");
    } finally {
      setLoading(false);
    }
  }

  async function refreshFavorites() {
    const list = (await window.qqplayer.favorites.list()) as FavoritePlaylist[];
    setFavorites(list);
    if (list.length > 0 && (!selectedPlaylistId || !list.some((item) => item.id === selectedPlaylistId))) {
      setSelectedPlaylistId(list[0]!.id);
    }
  }

  async function refreshDownloads() {
    setDownloads((await window.qqplayer.downloads.list()) as DownloadTask[]);
  }

  async function loadDownloadDirectory() {
    setDownloadDir(await window.qqplayer.downloads.getDirectory());
  }

  useEffect(() => {
    void refreshFavorites();
    void refreshDownloads();
    void loadDownloadDirectory();
    void window.qqplayer.downloads.syncDownloaded().finally(() => void refreshFavorites());
  }, []);

  useEffect(() => {
    if (page !== "downloads") return;
    const timer = window.setInterval(() => void refreshDownloads(), 1200);
    return () => window.clearInterval(timer);
  }, [page]);

  useEffect(() => {
    if (page !== "favorites") return;
    const timer = window.setInterval(() => {
      void refreshFavorites();
      void refreshDownloads();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [page]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") void search();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    const container = lyricsRef.current;
    if (!container || !player.lyrics || page !== "lyrics") return;
    const activeLines = container.querySelectorAll<HTMLElement>(".lyric-line.active");
    const active = activeLines[activeLines.length - 1];
    if (!active) return;
    const top = active.offsetTop - container.clientHeight / 2 + active.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [page, player.currentTimeSec, player.lyrics]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function ensurePlaylist(): Promise<string> {
    const list = (await window.qqplayer.favorites.list()) as FavoritePlaylist[];
    if (list.length > 0) {
      const id = selectedPlaylistId && list.some((item) => item.id === selectedPlaylistId)
        ? selectedPlaylistId
        : list[0]!.id;
      setSelectedPlaylistId(id);
      return id;
    }
    const created = (await window.qqplayer.favorites.create("我的收藏")) as FavoritePlaylist;
    setFavorites([created]);
    setSelectedPlaylistId(created.id);
    return created.id;
  }

  async function addToFavorites(track: Track) {
    try {
      const playlistId = await ensurePlaylist();
      await window.qqplayer.favorites.addTrack(playlistId, track);
      await refreshFavorites();
      setToast(`已添加到收藏夹`);
    } catch (error) {
      setToast((error as Error).message);
    }
  }

  async function downloadTrack(track: Track) {
    try {
      await window.qqplayer.downloads.create(track.mid || track.id, "M500", undefined, {
        includeLyrics: downloadLyrics,
        includeTranslation: downloadTranslation
      });
      await refreshDownloads();
      await refreshFavorites();
      setToast("已开始下载");
    } catch (error) {
      setToast((error as Error).message);
    }
  }

  async function selectDownloadDirectory() {
    const selected = await window.qqplayer.downloads.selectDirectory();
    if (!selected) return;
    await window.qqplayer.downloads.setDirectory(selected);
    setDownloadDir(selected);
    setToast("下载目录已更新");
  }

  async function pauseDownload(taskId: string) {
    await window.qqplayer.downloads.pause(taskId);
    await refreshDownloads();
  }

  async function resumeDownload(taskId: string) {
    await window.qqplayer.downloads.resume(taskId);
    await refreshDownloads();
  }

  async function cancelDownload(taskId: string) {
    await window.qqplayer.downloads.cancel(taskId);
    await refreshDownloads();
  }

  async function clearDownloads() {
    await window.qqplayer.downloads.clear();
    await refreshDownloads();
    setToast("下载列表已清空");
  }

  async function toggleCloseBehavior() {
    const next = closeBehavior === "tray" ? "quit" : "tray";
    setCloseBehavior(next);
    await window.qqplayer.settings.setCloseBehavior(next);
  }

  async function downloadPlaylist() {
    if (!selectedPlaylist || selectedPlaylist.tracks.length === 0) return;
    try {
      for (const track of selectedPlaylist.tracks) {
        await window.qqplayer.downloads.create(track.mid || track.id, "M500", undefined, {
          includeLyrics: downloadLyrics,
          includeTranslation: downloadTranslation
        });
      }
      await refreshDownloads();
      await refreshFavorites();
      setToast(`已将 ${selectedPlaylist.tracks.length} 首加入下载队列`);
    } catch (error) {
      setToast((error as Error).message);
    }
  }

  async function submitPlaylistDialog() {
    if (!playlistDialog) return;
    const name = dialogName.trim();
    if (!name) return;
    try {
      if (playlistDialog.mode === "create") {
        const created = (await window.qqplayer.favorites.create(name)) as FavoritePlaylist;
        setSelectedPlaylistId(created.id);
      } else {
        await window.qqplayer.favorites.rename(playlistDialog.playlistId, name);
      }
      await refreshFavorites();
      setPlaylistDialog(null);
      setDialogName("");
      setToast("收藏夹已保存");
    } catch (error) {
      setToast((error as Error).message);
    }
  }

  async function deletePlaylist(playlistId: string) {
    try {
      await window.qqplayer.favorites.delete(playlistId);
      setSelectedPlaylistId(null);
      await refreshFavorites();
      setToast("收藏夹已删除");
    } catch (error) {
      setToast((error as Error).message);
    }
  }

  async function removeFromFavorites(trackId: string) {
    if (!selectedPlaylistId) return;
    try {
      if (selectedPlaylistId === "__downloaded__") {
        await window.qqplayer.downloads.removeDownloadedTrack(trackId);
      } else {
        await window.qqplayer.favorites.removeTrack(selectedPlaylistId, trackId);
      }
      await refreshFavorites();
      setToast("已从收藏夹移除");
    } catch (error) {
      setToast((error as Error).message);
    }
  }

  const selectedPlaylist = favorites.find((item) => item.id === selectedPlaylistId) ?? null;

  return (
    <div className="app-shell">
      <div className="titlebar-drag" />
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">Q</span>
          <span>QQPlayer</span>
        </div>
        <nav className="nav-list">
          <button className={`nav-item ${page === "search" ? "active" : ""}`} onClick={() => setPage("search")}>搜索</button>
          <button className={`nav-item ${page === "playlist" ? "active" : ""}`} onClick={() => setPage("playlist")}>播放列表</button>
          <button className={`nav-item ${page === "favorites" ? "active" : ""}`} onClick={() => setPage("favorites")}>收藏夹</button>
          <button className={`nav-item ${page === "downloads" ? "active" : ""}`} onClick={() => setPage("downloads")}>下载</button>
        </nav>
        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={() => void toggleCloseBehavior()}>
            {closeBehavior === "tray" ? "关闭窗口：最小化到托盘" : "关闭窗口：退出程序"}
          </button>
          <button className="theme-toggle" onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "🌙 暗色模式" : "☀️ 亮色模式"}
          </button>
          <span>非官方客户端</span>
        </div>
      </aside>

      <main className="main-panel">
        {page === "search" && (
          <>
            <header className="search-header">
              <div className="search-box">
                <SearchIcon />
                <input
                  autoFocus
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索歌曲、歌手"
                />
              </div>
              <button className="search-button" onClick={() => void search()} disabled={loading || !keyword.trim()}>
                {loading ? <span className="spinner" /> : "搜索"}
              </button>
            </header>

            <section className="result-section">
              <div className="section-title">
                <h2>搜索结果</h2>
                {results.length > 0 && <span>{results.length} 首</span>}
              </div>

              {searchError && <div className="notice error">{searchError}</div>}
              {!loading && !searchError && results.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">♪</div>
                  <p>输入关键词开始搜索</p>
                </div>
              )}

              <div className="track-list">
                {results.map((track, index) => {
                  const artist = track.artists.map((item) => item.name).join(" / ");
                  const isCurrent = player.currentTrack?.mid === track.mid || player.currentTrack?.id === track.id;
                  return (
                    <div
                      key={track.mid || track.id}
                      className={`track-row ${isCurrent ? "playing" : ""}`}
                      onClick={() => void player.playQueue(results, index)}
                    >
                      <button className="track-play-hit" type="button">
                        <span className="track-index">{isCurrent ? <PlayingBars /> : index + 1}</span>
                        <img className="track-cover" src={track.coverUrl} alt="" />
                        <span className="track-main">
                          <span className="track-title">{track.title}</span>
                          <span className="track-subtitle">{artist} · {track.album.name}</span>
                        </span>
                        <span className="track-duration">{track.durationSec ? formatTime(track.durationSec) : "--:--"}</span>
                      </button>
                      <button
                        className="next-hit"
                        type="button"
                        title="下一首播放"
                        onClick={(event) => {
                          event.stopPropagation();
                          void player.playNext(track);
                        }}
                      >⏭</button>
                      <button
                        className="download-hit"
                        type="button"
                        title="下载"
                        onClick={(event) => {
                          event.stopPropagation();
                          void downloadTrack(track);
                        }}
                      >↓</button>
                      <button
                        className="favorite-hit"
                        type="button"
                        title="收藏"
                        onClick={(event) => {
                          event.stopPropagation();
                          void addToFavorites(track);
                        }}
                      >☆</button>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {page === "lyrics" && (
          <section className="lyrics-page">
            {player.currentTrack ? (
              <>
                <div className="lyrics-hero">
                  <img src={player.currentTrack.coverUrl} alt="" />
                  <div>
                    <h1>{player.currentTrack.title}</h1>
                    <p>{player.currentTrack.artists.map((artist) => artist.name).join(" / ")}</p>
                  </div>
                </div>
                <div className="lyric-page-list" ref={lyricsRef}>
                  {player.lyrics?.lines.length ? (
                    player.lyrics.lines.map((line) => (
                      <div
                        key={`${line.startMs}-${line.text}`}
                        className={`lyric-line ${line.startMs <= player.currentTimeSec * 1000 ? "active" : ""}`}
                        onClick={() => player.seek(line.startMs / 1000)}
                      >
                        <span>{line.text}</span>
                        {line.translation && <small>{line.translation}</small>}
                      </div>
                    ))
                  ) : (
                    <div className="panel-empty">暂无歌词</div>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state">请先选择并播放一首歌曲</div>
            )}
          </section>
        )}

        {page === "favorites" && (
          <section className="favorites-page">
            <header className="favorites-header">
              <div>
                <h1>收藏夹</h1>
                <p>管理你的歌单和收藏歌曲</p>
              </div>
              <button className="primary-button" onClick={() => { setPlaylistDialog({ mode: "create" }); setDialogName(""); }}>新建收藏夹</button>
            </header>

            <div className="favorites-layout">
              <aside className="playlist-sidebar">
                {favorites.map((playlist) => (
                  <div key={playlist.id} className={`playlist-item ${playlist.id === selectedPlaylistId ? "active" : ""}`}>
                    <button onClick={() => setSelectedPlaylistId(playlist.id)}>
                      <strong>{playlist.name}</strong>
                      <span>{playlist.tracks.length} 首</span>
                    </button>
                    {playlist.id !== "__downloaded__" && (
                      <>
                        <button onClick={() => { setPlaylistDialog({ mode: "rename", playlistId: playlist.id, name: playlist.name }); setDialogName(playlist.name); }}>重命名</button>
                        <button onClick={() => void deletePlaylist(playlist.id)}>删除</button>
                      </>
                    )}
                  </div>
                ))}
                {favorites.length === 0 && <div className="panel-empty">还没有收藏夹</div>}
              </aside>

              <div className="playlist-detail">
                {selectedPlaylist ? (
                  <>
                    <div className="section-title">
                      <div>
                        <h2>{selectedPlaylist.name}</h2>
                        <span>{selectedPlaylist.tracks.length} 首</span>
                      </div>
                      <button className="primary-button" onClick={() => void player.playQueue(selectedPlaylist.tracks, 0)}>
                        播放全部
                      </button>
                      <button className="primary-button" onClick={() => void downloadPlaylist()}>
                        下载全部
                      </button>
                    </div>
                    <div className="track-list">
                      {selectedPlaylist.tracks.map((track, index) => (
                        <div
                          key={track.mid || track.id}
                          className="track-row"
                          onClick={() => void player.playQueue(selectedPlaylist.tracks, index)}
                        >
                          <button className="track-play-hit" type="button">
                            <span className="track-index">{index + 1}</span>
                            <img className="track-cover" src={track.coverUrl} alt="" />
                            <span className="track-main">
                              <span className="track-title">{track.title}</span>
                              <span className="track-subtitle">{track.artists.map((artist) => artist.name).join(" / ")}</span>
                            </span>
                            <span className="track-duration">{track.durationSec ? formatTime(track.durationSec) : "--:--"}</span>
                          </button>
                          <button
                            className="next-hit"
                            type="button"
                            title="下一首播放"
                            onClick={(event) => {
                              event.stopPropagation();
                              void player.playNext(track);
                            }}
                          >⏭</button>
                          <button
                            className="download-hit"
                            type="button"
                            title="下载"
                            onClick={(event) => {
                              event.stopPropagation();
                              void downloadTrack(track);
                            }}
                          >↓</button>
                          <button
                            className="remove-hit"
                            type="button"
                            title="移除"
                            onClick={(event) => {
                              event.stopPropagation();
                              void removeFromFavorites(track.id || track.mid);
                            }}
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="empty-state">选择或新建一个收藏夹</div>
                )}
              </div>
            </div>
          </section>
        )}

        {page === "downloads" && (
          <section className="downloads-page">
            <header className="downloads-header">
              <div>
                <h1>下载</h1>
                <p>管理下载任务与保存目录</p>
              </div>
              <button className="primary-button" onClick={() => void clearDownloads()}>清空列表</button>
            </header>

            <div className="download-dir-card">
              <div>
                <strong>下载目录</strong>
                <span>{downloadDir || "读取中..."}</span>
              </div>
              <button className="primary-button" onClick={() => void selectDownloadDirectory()}>更改目录</button>
            </div>

            <div className="download-options">
              <label>
                <input type="checkbox" checked={downloadLyrics} onChange={(event) => setDownloadLyrics(event.target.checked)} />
                下载歌词
              </label>
              <label>
                <input type="checkbox" checked={downloadTranslation} onChange={(event) => setDownloadTranslation(event.target.checked)} />
                下载翻译
              </label>
            </div>

            <div className="download-list">
              {downloads.length === 0 ? (
                <div className="empty-state">暂无下载任务</div>
              ) : (
                downloads.map((task) => (
                  <div className="download-item" key={task.id}>
                    <img src={task.track.coverUrl} alt="" />
                    <div className="download-info">
                      <strong>{task.track.title}</strong>
                      <span>{task.track.artists.map((artist) => artist.name).join(" / ")}</span>
                      <span>{task.status === "downloading" ? formatBytes(task.receivedBytes) : statusText(task.status)}</span>
                    </div>
                    <div className="download-progress">
                      <div style={{ width: `${progressPercent(task)}%` }} />
                    </div>
                    <span className="download-percent">{progressPercent(task).toFixed(0)}%</span>
                    <div className="download-actions">
                      {task.status === "downloading" && <button onClick={() => void pauseDownload(task.id)}>暂停</button>}
                      {(task.status === "paused" || task.status === "failed") && <button onClick={() => void resumeDownload(task.id)}>继续</button>}
                      {(task.status === "downloading" || task.status === "paused" || task.status === "queued") && <button onClick={() => void cancelDownload(task.id)}>取消</button>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {page === "playlist" && (
          <section className="playlist-page">
            <header className="playlist-header">
              <div>
                <h1>播放列表</h1>
                <p>当前队列与循环模式</p>
              </div>
              <div className="loop-switcher">
                <button
                  className={player.loopMode === "none" ? "active" : ""}
                  onClick={() => player.setLoopMode("none")}
                >顺序播放</button>
                <button
                  className={player.loopMode === "all" ? "active" : ""}
                  onClick={() => player.setLoopMode("all")}
                >列表循环</button>
                <button
                  className={player.loopMode === "one" ? "active" : ""}
                  onClick={() => player.setLoopMode("one")}
                >单曲循环</button>
                <button
                  className={player.shuffle ? "active" : ""}
                  onClick={player.toggleShuffle}
                >随机播放</button>
              </div>
            </header>

            <div className="playlist-queue">
              {player.queue.length === 0 ? (
                <div className="empty-state">播放列表为空</div>
              ) : (
                player.queue.map((track, index) => (
                  <div
                    key={`${track.mid || track.id}-${index}`}
                    className={`queue-track ${index === player.queue.findIndex((item) => item.mid === player.currentTrack?.mid && item.id === player.currentTrack?.id) ? "active" : ""}`}
                    onClick={() => void player.playQueue(player.queue, index)}
                  >
                    <span>{index + 1}</span>
                    <img src={track.coverUrl} alt="" />
                    <div>
                      <strong>{track.title}</strong>
                      <span>{track.artists.map((artist) => artist.name).join(" / ")}</span>
                    </div>
                    <span>{formatTime(track.durationSec ?? 0)}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="player-bar">
        <div className="player-track">
          {player.currentTrack ? (
            <>
              <img src={player.currentTrack.coverUrl} alt="" />
              <div>
                <strong>{player.currentTrack.title}</strong>
                <span>{player.currentTrack.artists.map((artist) => artist.name).join(" / ")}</span>
              </div>
            </>
          ) : (
            <span className="player-empty">选择一首歌开始播放</span>
          )}
        </div>

        <div className="player-center">
          <div className="player-controls">
            <button className="control-button" onClick={player.toggleShuffle} title="随机播放">
              {player.shuffle ? "🔀" : "🔁"}
            </button>
            <button className="control-button" onClick={() => void player.previous()} title="上一首">⏮</button>
            <button className="play-button" onClick={() => void player.toggle()} title={player.isPlaying ? "暂停" : "播放"}>
              {player.isPlaying ? "❚❚" : "▶"}
            </button>
            <button className="control-button" onClick={() => void player.next()} title="下一首">⏭</button>
            <button
              className="control-button"
              onClick={() => player.setLoopMode(player.loopMode === "all" ? "one" : player.loopMode === "one" ? "none" : "all")}
              title="循环模式"
            >
              {player.loopMode === "one" ? "1️⃣" : player.loopMode === "all" ? "🔁" : "➡"}
            </button>
          </div>
          <div className="progress-row">
            <span>{formatTime(player.currentTimeSec)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(1, player.durationSec)}
              value={Math.min(player.currentTimeSec, player.durationSec)}
              onChange={(event) => player.seek(Number(event.target.value))}
            />
            <span>{formatTime(player.durationSec)}</span>
          </div>
        </div>

        <div className="player-actions">
          <button
            className={`lyrics-entry ${page === "lyrics" ? "active" : ""}`}
            onClick={() => setPage((current) => current === "lyrics" ? "search" : "lyrics")}
            title="歌词"
          >
            词
          </button>
          <button className="icon-button" onClick={() => setShowVolume((value) => !value)}>🔊</button>
          {showVolume && (
            <input
              className="volume-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={player.volume}
              onChange={(event) => player.setVolume(Number(event.target.value))}
            />
          )}
        </div>
      </footer>

      {playlistDialog && (
        <div className="modal-backdrop" onClick={() => setPlaylistDialog(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>{playlistDialog.mode === "create" ? "新建收藏夹" : "重命名收藏夹"}</h2>
            <input
              autoFocus
              value={dialogName}
              onChange={(event) => setDialogName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitPlaylistDialog();
              }}
              placeholder="收藏夹名称"
            />
            <div className="modal-actions">
              <button onClick={() => setPlaylistDialog(null)}>取消</button>
              <button className="primary-button" onClick={() => void submitPlaylistDialog()}>保存</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {player.error && <div className="toast error">{player.error}</div>}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PlayingBars() {
  return (
    <span className="playing-bars" aria-label="正在播放">
      <i />
      <i />
      <i />
    </span>
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
    case "queued":
      return "等待中";
    case "downloading":
      return "下载中";
    case "paused":
      return "已暂停";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "canceled":
      return "已取消";
  }
}

function createDesktopService(): CoreService {
  return {
    auth: {
      getStatus: () => window.qqplayer.auth.getStatus() as Promise<any>,
      startQrLogin: () => Promise.reject(new Error("未实现登录")),
      pollQrLogin: () => Promise.reject(new Error("未实现登录")),
      importCredential: () => Promise.reject(new Error("未实现登录")),
      logout: () => window.qqplayer.auth.getStatus() as Promise<void>
    },
    catalog: {
      search: (keyword, page, pageSize) => window.qqplayer.catalog.search(keyword, page, pageSize) as Promise<SearchPage>,
      getTrack: (trackId) => window.qqplayer.catalog.getTrack(trackId) as Promise<Track>
    },
    media: {
      resolveUrl: (trackId, quality) => window.qqplayer.media.resolveUrl(trackId, quality) as Promise<any>,
      getLyrics: (trackId) => window.qqplayer.media.getLyrics(trackId) as Promise<any>
    },
    downloads: {
      create: (trackId, quality, targetPath, options) => window.qqplayer.downloads.create(trackId, quality, targetPath, options) as Promise<any>,
      pause: (taskId) => window.qqplayer.downloads.pause(taskId) as Promise<any>,
      resume: (taskId) => window.qqplayer.downloads.resume(taskId) as Promise<any>,
      cancel: (taskId) => window.qqplayer.downloads.cancel(taskId) as Promise<any>,
      list: () => window.qqplayer.downloads.list() as Promise<any[]>,
      clear: () => window.qqplayer.downloads.clear(),
      getDirectory: () => window.qqplayer.downloads.getDirectory(),
      setDirectory: (directory) => window.qqplayer.downloads.setDirectory(directory),
      syncDownloaded: () => window.qqplayer.downloads.syncDownloaded(),
      removeDownloadedTrack: (trackId) => window.qqplayer.downloads.removeDownloadedTrack(trackId)
    },
    favorites: {
      listPlaylists: () => window.qqplayer.favorites.list() as Promise<FavoritePlaylist[]>,
      createPlaylist: (name) => window.qqplayer.favorites.create(name) as Promise<FavoritePlaylist>,
      renamePlaylist: (playlistId, name) => window.qqplayer.favorites.rename(playlistId, name) as Promise<FavoritePlaylist>,
      deletePlaylist: (playlistId) => window.qqplayer.favorites.delete(playlistId),
      addTrack: (playlistId, track) => window.qqplayer.favorites.addTrack(playlistId, track) as Promise<FavoritePlaylist>,
      removeTrack: (playlistId, trackId) => window.qqplayer.favorites.removeTrack(playlistId, trackId) as Promise<FavoritePlaylist>
    },
    warmup: async () => {},
    dispose: async () => {}
  };
}
