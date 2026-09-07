# QQPlayer

本地第三方 QQ 音乐播放器。`QQMusicapi-main` 仅用于协议行为参考，不参与构建。

## 结构

- `packages/core`：QQ 音乐协议核心、设备/QIMEI、搜索、VKey、歌词与下载。
- `packages/ui`：React 播放器状态与共享 UI。
- `apps/desktop`：Windows Electron 应用。
- `apps/mobile`：Capacitor Android 工程、内嵌 Node 运行时与 JSON-RPC 桥。

## 开发

```powershell
npm.cmd install -g pnpm@9.15.0
pnpm install --ignore-scripts
pnpm build
pnpm test
pnpm typecheck
```

## Android 说明

Android 首版只支持 `arm64-v8a`、Android API 29+。本机需要提供 Node.js 22 的 `libnode.so` 与头文件，并将 `QQPLAYER_NODE_HOME` 指向 `include/`、`lib/arm64-v8a/` 所在目录；也可以在 `.github/workflows/android.yml` 中完成编译。

当前版本未实现 QQ 登录，VIP/DRM 受限曲目无法解析或下载属于预期行为。
