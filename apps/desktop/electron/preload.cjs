const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("qqplayer", {
  auth: {
    getStatus: () => ipcRenderer.invoke("auth:getStatus")
  },
  catalog: {
    search: (keyword, page, pageSize) => ipcRenderer.invoke("catalog:search", keyword, page, pageSize),
    getTrack: (trackId) => ipcRenderer.invoke("catalog:getTrack", trackId)
  },
  media: {
    resolveUrl: (trackId, quality) => ipcRenderer.invoke("media:resolveUrl", trackId, quality),
    getLyrics: (trackId) => ipcRenderer.invoke("media:getLyrics", trackId)
  },
  downloads: {
    create: (trackId, quality, targetPath, options) => ipcRenderer.invoke("downloads:create", trackId, quality, targetPath, options),
    pause: (taskId) => ipcRenderer.invoke("downloads:pause", taskId),
    resume: (taskId) => ipcRenderer.invoke("downloads:resume", taskId),
    cancel: (taskId) => ipcRenderer.invoke("downloads:cancel", taskId),
    list: () => ipcRenderer.invoke("downloads:list"),
    clear: () => ipcRenderer.invoke("downloads:clear"),
    getDirectory: () => ipcRenderer.invoke("downloads:getDirectory"),
    setDirectory: (directory) => ipcRenderer.invoke("downloads:setDirectory", directory),
    syncDownloaded: () => ipcRenderer.invoke("downloads:syncDownloaded"),
    removeDownloadedTrack: (trackId) => ipcRenderer.invoke("downloads:removeDownloadedTrack", trackId),
    selectDirectory: () => ipcRenderer.invoke("dialog:selectDownloadDirectory")
  },
  favorites: {
    list: () => ipcRenderer.invoke("favorites:list"),
    create: (name) => ipcRenderer.invoke("favorites:create", name),
    rename: (playlistId, name) => ipcRenderer.invoke("favorites:rename", playlistId, name),
    delete: (playlistId) => ipcRenderer.invoke("favorites:delete", playlistId),
    addTrack: (playlistId, track) => ipcRenderer.invoke("favorites:addTrack", playlistId, track),
    removeTrack: (playlistId, trackId) => ipcRenderer.invoke("favorites:removeTrack", playlistId, trackId)
  },
  window: {
    setTitleBarTheme: (theme) => ipcRenderer.invoke("window:setTitleBarTheme", theme)
  },
  settings: {
    getCloseBehavior: () => ipcRenderer.invoke("settings:getCloseBehavior"),
    setCloseBehavior: (value) => ipcRenderer.invoke("settings:setCloseBehavior", value)
  }
});
