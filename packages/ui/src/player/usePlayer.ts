import { useEffect, useMemo, useRef, useState } from "react";
import type { CoreService, LyricDocument, Track } from "@qqplayer/core";

export type LoopMode = "none" | "all" | "one";

export interface PlayerController {
  currentTrack: Track | null;
  queue: Track[];
  isPlaying: boolean;
  currentTimeSec: number;
  durationSec: number;
  volume: number;
  loopMode: LoopMode;
  shuffle: boolean;
  lyrics: LyricDocument | null;
  error: string | null;
  playTrack(track: Track): Promise<void>;
  playQueue(tracks: Track[], startIndex?: number): Promise<void>;
  playNext(track: Track): Promise<void>;
  toggle(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(seconds: number): void;
  setVolume(value: number): void;
  setLoopMode(mode: LoopMode): void;
  toggleShuffle(): void;
}

export function usePlayer(service: CoreService): PlayerController {
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [loopMode, setLoopMode] = useState<LoopMode>("all");
  const [shuffle, setShuffle] = useState(false);
  const [lyrics, setLyrics] = useState<LyricDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadTokenRef = useRef(0);
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const loopRef = useRef(loopMode);
  loopRef.current = loopMode;
  const shuffleRef = useRef(shuffle);
  shuffleRef.current = shuffle;

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "auto";
      audioRef.current.volume = volume;
    }
    const audio = audioRef.current;
    const updateTime = () => setCurrentTimeSec(audio.currentTime);
    const updateDuration = () => setDurationSec(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      void handleEnded();
    };
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [volume]);

  const currentTrack = useMemo(() => (currentIndex >= 0 ? queue[currentIndex] ?? null : null), [currentIndex, queue]);

  async function handleEnded(): Promise<void> {
    if (loopRef.current === "one") {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        await audio.play();
      }
      return;
    }
    if (queueRef.current.length === 1 && loopRef.current !== "none") return;
    await next();
  }

  async function loadTrack(index: number, targetQueue: Track[] = queueRef.current): Promise<void> {
    const track = targetQueue[index];
    if (!track) return;
    const token = ++loadTokenRef.current;
    setCurrentIndex(index);
    currentIndexRef.current = index;
    setError(null);
    setLyrics(null);
    try {
      const media = await service.media.resolveUrl(track.mid || track.id, "M500");
      if (token !== loadTokenRef.current) return;
      const audio = audioRef.current!;
      audio.src = media.url;
      audio.currentTime = 0;
      void service.media.getLyrics(track.mid || track.id)
        .then((lyric) => {
          if (token === loadTokenRef.current) setLyrics(lyric);
        })
        .catch(() => {
          // 歌词加载失败不阻断播放
        });
      void audio.play().catch((cause) => {
        if (token === loadTokenRef.current && !isPlaybackInterrupted(cause)) {
          setError((cause as Error).message);
        }
      });
    } catch (cause) {
      if (token === loadTokenRef.current) setError(errorMessage(cause));
    }
  }

  async function playTrack(track: Track): Promise<void> {
    const existing = queueRef.current.findIndex((item) => item.mid === track.mid || item.id === track.id);
    if (existing >= 0) {
      await loadTrack(existing);
    } else {
      const nextQueue = [...queueRef.current, track];
      queueRef.current = nextQueue;
      setQueue(nextQueue);
      await loadTrack(nextQueue.length - 1, nextQueue);
    }
  }

  async function playQueue(tracks: Track[], startIndex = 0): Promise<void> {
    queueRef.current = tracks;
    setQueue(tracks);
    await loadTrack(startIndex, tracks);
  }

  async function playNext(track: Track): Promise<void> {
    const queueLength = queueRef.current.length;
    if (queueLength === 0 || currentIndexRef.current < 0) {
      await playTrack(track);
      return;
    }
    const insertAt = currentIndexRef.current + 1;
    const nextQueue = [...queueRef.current];
    nextQueue.splice(insertAt, 0, track);
    queueRef.current = nextQueue;
    setQueue(nextQueue);
  }

  async function toggle(): Promise<void> {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) await audio.play();
    else audio.pause();
  }

  async function next(): Promise<void> {
    const queueLength = queueRef.current.length;
    if (queueLength === 0) return;
    let nextIndex: number;
    if (shuffleRef.current) {
      nextIndex = Math.floor(Math.random() * queueLength);
    } else {
      nextIndex = currentIndexRef.current + 1;
      if (nextIndex >= queueLength) {
        if (loopRef.current === "none") {
          audioRef.current?.pause();
          return;
        }
        nextIndex = 0;
      }
    }
    await loadTrack(nextIndex);
  }

  async function previous(): Promise<void> {
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    const queueLength = queueRef.current.length;
    if (queueLength === 0) return;
    await loadTrack((currentIndexRef.current - 1 + queueLength) % queueLength);
  }

  function seek(seconds: number): void {
    if (audioRef.current) audioRef.current.currentTime = Math.max(0, Math.min(seconds, durationSec || seconds));
  }

  function setVolume(value: number): void {
    const next = Math.max(0, Math.min(1, value));
    setVolumeState(next);
    if (audioRef.current) audioRef.current.volume = next;
  }

  function toggleShuffle(): void {
    setShuffle((value) => !value);
  }

  return {
    currentTrack,
    queue,
    isPlaying,
    currentTimeSec,
    durationSec,
    volume,
    loopMode,
    shuffle,
    lyrics,
    error,
    playTrack,
    playQueue,
    playNext,
    toggle,
    next,
    previous,
    seek,
    setVolume,
    setLoopMode,
    toggleShuffle
  };
}

function isPlaybackInterrupted(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  return cause instanceof DOMException && cause.name === "AbortError" ||
    /interrupted by a new load request/i.test(message) ||
    /load request/i.test(message);
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function formatTime(seconds: number): string {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(value / 60);
  const secs = Math.floor(value % 60);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
