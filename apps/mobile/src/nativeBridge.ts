import { registerPlugin } from "@capacitor/core";

interface QqPlayerCorePlugin {
  call(options: { method: string; params?: Record<string, unknown> }): Promise<{ value?: unknown }>;
}

const plugin = registerPlugin<QqPlayerCorePlugin>("QqPlayerCore");

export function installNativeBridge(): void {
  window.QQPlayerBridge = {
    call: async (method, params) => {
      const result = await plugin.call({ method, params: params as Record<string, unknown> | undefined });
      return result.value;
    }
  };
}
