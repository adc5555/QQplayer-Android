import net from "node:net";
import { createCoreService } from "@qqplayer/core";

const portArg = process.argv.find((arg) => arg.startsWith("--qqplayer-port="));
const tokenArg = process.argv.find((arg) => arg.startsWith("--qqplayer-token="));
const dataDirArg = process.argv.find((arg) => arg.startsWith("--qqplayer-data-dir="));
const port = Number(portArg?.split("=")[1] ?? 0);
const token = tokenArg?.split("=")[1] ?? "";
const dataDir = dataDirArg?.split("=")[1] ?? process.cwd();

if (!port || !token) {
  throw new Error("QQPlayer Node runtime requires --qqplayer-port and --qqplayer-token");
}

const service = createCoreService({ platform: "android", dataDir });

const server = net.createServer((socket) => {
  let buffer = "";
  socket.setEncoding("utf-8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) void handleLine(line, socket);
      newline = buffer.indexOf("\n");
    }
  });
});

server.listen(port, "127.0.0.1");

async function handleLine(line: string, socket: net.Socket): Promise<void> {
  let request: any;
  try {
    request = JSON.parse(line);
  } catch {
    return writeResponse(socket, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
  }
  if (request?.token !== token) {
    return writeResponse(socket, { jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32001, message: "unauthorized" } });
  }
  try {
    const result = await invoke(request.method, request.params ?? {});
    writeResponse(socket, { jsonrpc: "2.0", id: request.id ?? null, result });
  } catch (error) {
    writeResponse(socket, {
      jsonrpc: "2.0",
      id: request.id ?? null,
      error: { code: -32000, message: (error as Error).message }
    });
  }
}

function writeResponse(socket: net.Socket, value: unknown): void {
  socket.write(`${JSON.stringify(value)}\n`);
}

async function invoke(method: string, params: Record<string, any>): Promise<unknown> {
  switch (method) {
    case "auth.getStatus":
      return service.auth.getStatus();
    case "catalog.search":
      return service.catalog.search(params.keyword, params.page, params.pageSize);
    case "catalog.getTrack":
      return service.catalog.getTrack(params.trackId);
    case "media.resolveUrl":
      return service.media.resolveUrl(params.trackId, params.quality);
    case "media.getLyrics":
      return service.media.getLyrics(params.trackId);
    case "downloads.create":
      return service.downloads.create(params.trackId, params.quality, params.targetPath, params.options);
    case "downloads.pause":
      return service.downloads.pause(params.taskId);
    case "downloads.resume":
      return service.downloads.resume(params.taskId);
    case "downloads.cancel":
      return service.downloads.cancel(params.taskId);
    case "downloads.list":
      return service.downloads.list();
    case "downloads.clear":
      return service.downloads.clear();
    case "downloads.getDirectory":
      return service.downloads.getDirectory();
    case "downloads.setDirectory":
      return service.downloads.setDirectory(params.directory);
    case "downloads.syncDownloaded":
      return service.downloads.syncDownloaded();
    case "downloads.removeDownloadedTrack":
      return service.downloads.removeDownloadedTrack(params.trackId);
    case "favorites.listPlaylists":
      return service.favorites.listPlaylists();
    case "favorites.createPlaylist":
      return service.favorites.createPlaylist(params.name);
    case "favorites.renamePlaylist":
      return service.favorites.renamePlaylist(params.playlistId, params.name);
    case "favorites.deletePlaylist":
      return service.favorites.deletePlaylist(params.playlistId);
    case "favorites.addTrack":
      return service.favorites.addTrack(params.playlistId, params.track);
    case "favorites.removeTrack":
      return service.favorites.removeTrack(params.playlistId, params.trackId);
    case "warmup":
      return service.warmup();
    default:
      throw new Error(`unknown method: ${method}`);
  }
}
