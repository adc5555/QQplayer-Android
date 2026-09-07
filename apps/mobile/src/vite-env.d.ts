/// <reference types="vite/client" />

interface Window {
  QQPlayerBridge?: {
    call(method: string, params?: unknown): Promise<unknown>;
  };
}
