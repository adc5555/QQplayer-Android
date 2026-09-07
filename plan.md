# QQ 音乐本地第三方播放器实施方案

## Summary

从零实现一套 TypeScript 本地解析核心，`QQMusicapi-main` 仅用于核对协议行为，不复制、依赖或打包其代码。首版支持 Windows 10/11 x64 与 Android 10+ arm64，统一使用 React UI；Windows 由 Electron 承载，Android 由 Capacitor 和内嵌 Node.js 运行时承载，不部署远程 API。

首版功能包括关键词搜索、QQ 二维码登录、凭据导入、音质解析、在线播放、同步歌词、播放队列和手动导出。暂不支持 iOS、歌单/收藏、分享链接解析或数字 ID 输入。

## Implementation Changes

- 建立 `pnpm` TypeScript monorepo：
  - `apps/desktop`：Electron 主进程、预加载脚本、Windows 安装与更新。
  - `apps/mobile`：Capacitor Android 工程、Node 运行时插件、存储与导出桥接。
  - `packages/core` 与 `packages/ui`：解析协议核心、共享类型、React 界面与播放器状态。

- 第一阶段完成 Android 硬性技术验证：
  - 为 Capacitor 编写原生插件，嵌入自编译的 Node.js 22 LTS `libnode.so`，首版只提供 `arm64-v8a`。
  - Node 在独立线程运行，通过仅绑定 `127.0.0.1` 的轻量 JSON-RPC 服务与 Kotlin 插件通信；每次启动生成随机端口和 256 位会话令牌，令牌不暴露给 WebView。
  - 验证 HTTPS、SHA-1/AES/RSA、QRC 解密、zlib、应用私有目录读写、暂停恢复和连续 20 次前后台/重启。
  - 按用户要求不提供远程 API 回退；验证不通过时停止移动端交付并报告具体阻塞。

- 独立实现本地协议核心：
  - HTTP 请求、Cookie、超时、限流、错误归一化和可取消请求。
  - 平台参数、设备身份、Session、QIMEI 注册和缓存。
  - 请求签名、歌曲搜索、详情、媒体 MID、VKey/播放地址和 QRC 歌词解析。
  - QQ 二维码登录、登录轮询、凭据刷新、登出和严格校验的凭据 JSON 导入。
  - 协议适配器与业务模型隔离，QQ 接口变化时只替换适配层。
  - 不绕过 VIP、DRM 或账号权限；只有当前账号实际获得有效媒体 URL 时才允许播放或导出。

- 定义统一的本地服务接口：
  - `auth.getStatus/startQrLogin/pollQrLogin/importCredential/logout`
  - `catalog.search/getTrack`
  - `media.resolveUrl/getLyrics`
  - `downloads.create/pause/resume/cancel/list`
  - 标准模型包括 `Track`、`Artist`、`Album`、`AudioQuality`、`ResolvedMedia`、`LyricDocument`、`DownloadTask` 和结构化 `CoreError`。
  - Electron 通过受限 preload IPC 直接调用核心；禁止 renderer 使用 Node、任意 IPC 或任意文件路径。
  - Android WebView 只调用 Capacitor 插件的白名单方法，由插件代理到内嵌 Node。

- 凭据与本地数据：
  - Windows 使用 Electron `safeStorage`/DPAPI，Android 使用 Keystore AES-GCM；凭据解密后只保留在核心内存中。
  - 设备标识和 Session 存放于应用私有目录，不与凭据混存。
  - 搜索历史、队列、播放进度、设置和下载记录使用 IndexedDB；退出登录时清除内存凭据和账号相关缓存。
  - 日志必须过滤 Cookie、VKey、二维码标识及全部凭据字段。

- 播放和导出：
  - React 播放器使用 HTML5 Audio 和 Media Session，支持播放/暂停、进度、上一首/下一首、队列、循环、随机和歌词同步。
  - 播放前根据 `canPlayType` 过滤格式；优先使用用户选择的音质，不兼容或无权限时按可播放格式逐级降级并明确提示。
  - URL 返回 401/403 或过期时自动重新解析一次，仍失败则停止播放并展示错误。
  - 下载采用临时 `.part` 文件、HTTP Range 续传、最多两个并发任务、取消/重试和过期 URL 刷新。
  - Windows 使用保存对话框；Android 先下载到私有缓存，再通过 Storage Access Framework 导出。
  - 文件名采用 `歌手 - 歌名.扩展名`，清理非法字符并为重名文件添加序号。

- 用户界面：
  - 桌面端采用左侧导航、中央搜索结果表格、右侧队列/歌词面板和固定底部播放器。
  - Android 使用搜索、正在播放、下载、设置四个底部标签页和迷你播放器。
  - 登录弹窗提供二维码与高级凭据导入；下载中心显示速度、进度、状态和失败原因。
  - 使用接口返回的真实专辑封面，不使用 QQ 音乐名称、Logo 或易造成官方误认的视觉资产，并标注“非官方客户端”。

- 发布与运维：
  - Windows 使用 `electron-builder` 生成 NSIS 安装包，`electron-updater` 从 GitHub Releases 获取更新。
  - Android 发布签名 APK，通过 GitHub Releases 检查版本；更新需用户确认下载并调用系统安装界面，不做静默安装。
  - React、Electron 和 Android 原生层接入 Sentry，首次启动征求匿名崩溃上报同意；无 DSN 时自动禁用。
  - 构建中排除 `QQMusicapi-main`、凭据、设备文件、调试响应和签名密钥。

## Test Plan

- 使用独立测试向量验证签名、QRC 解密、文件名生成、响应解析、音质降级和错误映射。
- 使用脱敏固定响应测试搜索、歌曲详情、登录状态、VKey、歌词及权限不足场景；网络测试覆盖超时、限流、空响应和接口字段变化。
- Electron E2E 覆盖登录、搜索、播放、切歌、歌词、凭据重启恢复、下载暂停续传和自动更新检查。
- Android 仪器测试覆盖 Node 启动、应用前后台、进程重建、媒体按键、Keystore、SAF 导出和断网恢复。
- 发布验收：Windows 冷启动后 5 秒内可搜索；Android Node 核心稳定启动；有效账号可完成搜索到播放链路；凭据不以明文落盘；本地 RPC 无令牌不可访问。

## Assumptions

- 首版仅支持 Windows x64 和 Android `arm64-v8a`，最低 Android API 29；iOS、macOS 和 Linux 不在范围内。
- “解析”仅指搜索结果的媒体地址和歌词解析，不提供分享链接、songmid 或 songid 粘贴入口。
- 导出能力不尝试破解 DRM、伪造会员权限或绕过 QQ 服务端限制。
- `QQMusicapi-main` 没有发现许可证文件，因此只作为行为参考；若某项算法只能从该项目代码获得，实施前需确认许可或寻找可独立验证的公开规范。
- 内部工程名暂用 `QQPlayer`，正式发布前更换为不侵犯 QQ/QQ 音乐商标的产品名与包标识。
