/// <reference types="vite/client" />

interface Window {
  qqplayer: {
    auth: {
      getStatus(): Promise<unknown>;
    };
    catalog: {
      search(keyword: string, page?: number, pageSize?: number): Promise<unknown>;
      getTrack(trackId: string): Promise<unknown>;
    };
    media: {
      resolveUrl(trackId: string, quality?: string): Promise<unknown>;
      getLyrics(trackId: string): Promise<unknown>;
    };
    downloads: {
      create(trackId: string, quality?: string, targetPath?: string): Promise<unknown>;
      pause(taskId: string): Promise<unknown>;
      resume(taskId: string): Promise<unknown>;
      cancel(taskId: string): Promise<unknown>;
      list(): Promise<unknown[]>;
      clear(): Promise<void>;
      getDirectory(): Promise<string>;
      setDirectory(directory: string): Promise<void>;
      selectDirectory(): Promise<string | null>;
    };
    favorites: {
      list(): Promise<unknown[]>;
      create(name: string): Promise<unknown>;
      rename(playlistId: string, name: string): Promise<unknown>;
      delete(playlistId: string): Promise<void>;
      addTrack(playlistId: string, track: unknown): Promise<unknown>;
      removeTrack(playlistId: string, trackId: string): Promise<unknown>;
    };
    window: {
      setTitleBarTheme(theme: "dark" | "light"): Promise<void>;
    };
    settings: {
      getCloseBehavior(): Promise<"tray" | "quit">;
      setCloseBehavior(value: "tray" | "quit"): Promise<void>;
    };
  };
}
