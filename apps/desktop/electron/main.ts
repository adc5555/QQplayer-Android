import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, safeStorage, Tray } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCoreService, type CoreService } from "@qqplayer/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let service: CoreService | undefined;
let tray: Tray | null = null;
let isQuitting = false;
let closeBehavior: "tray" | "quit" = "tray";

function getService(): CoreService {
  if (!service) {
    service = createCoreService({
      platform: "android",
      dataDir: app.getPath("userData")
    });
  }
  return service;
}

function registerIpc(): void {
  ipcMain.handle("settings:getCloseBehavior", () => closeBehavior);
  ipcMain.handle("settings:setCloseBehavior", (_event, value: "tray" | "quit") => {
    closeBehavior = value === "quit" ? "quit" : "tray";
    saveSettings();
  });
  ipcMain.handle("auth:getStatus", () => getService().auth.getStatus());
  ipcMain.handle("catalog:search", (_event, keyword: string, page = 1, pageSize = 30) =>
    getService().catalog.search(keyword, page, pageSize)
  );
  ipcMain.handle("catalog:getTrack", (_event, trackId: string) => getService().catalog.getTrack(trackId));
  ipcMain.handle("media:resolveUrl", (_event, trackId: string, quality?: string) =>
    getService().media.resolveUrl(trackId, quality)
  );
  ipcMain.handle("media:getLyrics", (_event, trackId: string) => getService().media.getLyrics(trackId));
  ipcMain.handle("downloads:create", (_event, trackId: string, quality?: string, targetPath?: string, options?: any) =>
    getService().downloads.create(trackId, quality, targetPath, options)
  );
  ipcMain.handle("downloads:pause", (_event, taskId: string) => getService().downloads.pause(taskId));
  ipcMain.handle("downloads:resume", (_event, taskId: string) => getService().downloads.resume(taskId));
  ipcMain.handle("downloads:cancel", (_event, taskId: string) => getService().downloads.cancel(taskId));
  ipcMain.handle("downloads:list", () => getService().downloads.list());
  ipcMain.handle("downloads:clear", () => getService().downloads.clear());
  ipcMain.handle("downloads:getDirectory", () => getService().downloads.getDirectory());
  ipcMain.handle("downloads:setDirectory", (_event, directory: string) => getService().downloads.setDirectory(directory));
  ipcMain.handle("downloads:syncDownloaded", () => getService().downloads.syncDownloaded());
  ipcMain.handle("downloads:removeDownloadedTrack", (_event, trackId: string) => getService().downloads.removeDownloadedTrack(trackId));
  ipcMain.handle("dialog:selectDownloadDirectory", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择下载目录",
      properties: ["openDirectory", "createDirectory"]
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle("window:setTitleBarTheme", (event, theme: "dark" | "light") => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.setTitleBarOverlay({
      color: theme === "light" ? "#f7f7f8" : "#171717",
      symbolColor: theme === "light" ? "#171717" : "#f5f5f5",
      height: 36
    });
  });
  ipcMain.handle("favorites:list", () => getService().favorites.listPlaylists());
  ipcMain.handle("favorites:create", (_event, name: string) => getService().favorites.createPlaylist(name));
  ipcMain.handle("favorites:rename", (_event, playlistId: string, name: string) =>
    getService().favorites.renamePlaylist(playlistId, name)
  );
  ipcMain.handle("favorites:delete", (_event, playlistId: string) => getService().favorites.deletePlaylist(playlistId));
  ipcMain.handle("favorites:addTrack", (_event, playlistId: string, track: unknown) =>
    getService().favorites.addTrack(playlistId, track as any)
  );
  ipcMain.handle("favorites:removeTrack", (_event, playlistId: string, trackId: string) =>
    getService().favorites.removeTrack(playlistId, trackId)
  );
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#111111",
    icon: path.join(__dirname, "../build/icon.png"),
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#171717",
      symbolColor: "#f5f5f5",
      height: 36
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      safeDialogs: true
    }
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) void window.loadURL(devServer);
  else void window.loadFile(path.join(__dirname, "../dist/index.html"));
  window.on("close", (event) => {
    if (!isQuitting && closeBehavior === "tray") {
      event.preventDefault();
      window.hide();
    }
  });
  return window;
}

function createTray(window: BrowserWindow): void {
  const icon = nativeImage.createFromPath(path.join(__dirname, "../build/icon.png")).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("QQPlayer");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示主窗口", click: () => window.show() },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on("click", () => {
    if (window.isVisible()) window.hide();
    else window.show();
  });
}

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings(): void {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(), "utf-8")) as { closeBehavior?: string };
    closeBehavior = raw.closeBehavior === "quit" ? "quit" : "tray";
  } catch {
    closeBehavior = "tray";
  }
}

function saveSettings(): void {
  const dir = app.getPath("userData");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(settingsPath(), `${JSON.stringify({ closeBehavior }, null, 2)}\n`, "utf-8");
}

void app.whenReady().then(() => {
  loadSettings();
  if (safeStorage.isEncryptionAvailable()) void safeStorage.encryptString("probe");
  registerIpc();
  const window = createWindow();
  void getService().warmup().catch(() => undefined);
  createTray(window);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  void getService().dispose();
});
