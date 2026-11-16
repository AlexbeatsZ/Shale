# PowerPoint 查看验收

## 实现范围

原生工作区、分屏和侧栏文件标签读取 `.ppt` / `.pptx`，共用 PDF 的分页会话、工具栏、页码跳转、Ctrl+滚轮、搜索和右侧大纲/缩略图。PPT 大纲来自可见文字和原分节，缩略图保持幻灯片比例。

命令显示为“切换 PDF / PPT 反色（深色背景适配）”，沿用 `pdf:toggle-dark` ID 和既有快捷键配置。正文与缩略图按同一路径同步持久化状态。

解析器为精确锁定的 MIT `@web-ppt/core` 0.8.0，格式解析和 SVG 布局交给上游实现。PPTX 使用本地 Worker，PPT 使用二进制解析入口。以静态终态查看课件。外部媒体、链接动作和动画播放均保持静态呈现。

## 自动与原生验证

- 全量单元 105 文件、600 项通过，含二进制原字节/Vault 身份、旧请求失效、关闭期间取消解析及晚到资源回收。
- PPT 专项、PDF 身份、工具栏与连续 PDF 缩放共 24 项浏览器通过，最终轮 42.5 秒。覆盖大小写扩展名、中文、正文/侧栏共享资源、相同搜索框、损坏文件、格式切换、独立导航、反色恢复和缩略图比例。
- Web/Server/Desktop 类型与生产构建通过。
- Mac arm64 实际 Electron 33.4.11 的 0.1.71 包通过两轮功能验收。最终证据 `/var/folders/td/w919x1754kb93qf72km7vffh0000gn/T/.agents/presentation-native-aAgLff/evidence`，包括 `result.json`、PPTX 深色缩略图与二进制 PPT 截图。每轮均使用一次性 Vault/profile，结束后清理输入数据。
- 原生检查确认两种格式、中文文字层、图片/表格实际彩色像素、搜索跳页、右侧大纲/缩略图、PDF/PPT 同一反色命令、按路径恢复、Ctrl+滚轮及源文件字节一致。renderer 错误和控制台错误均为零。
- `tests/packaged-startup.mjs` 通过，覆盖实际生产入口、Worker 默认 UA 资源请求、普通页面访问选择、编辑/落盘、脚本隔离、配置和原有表格主题回归。Mac 包 `codesign --verify --deep --strict` 通过。
- Android release/tabletRelease 均构建成功，两个 lint 各 0 Error、15 Warning。原证书、包名与非调试标志在发布前核对。

## 实现过程中修正

- 上游 sideEffects 声明使纯副作用导入的 Worker 包装被生产构建移除。改用上游 Worker 的 Vite 入口，生产包实际携带解析脚本。
- Electron Worker 请求使用会话默认 User-Agent，没有页面的 WebObsidian 标记。现有静态路由只为本地 Worker 的已打包哈希脚本提供兼容入口，HTML 保持原生选择规则。
- 原生 CSP 增加本地 blob 读取，解决课件图片内联失败。隔离图表脚本继续使用独立 CSP。
- 开发服务器预优化包含解析主包及 Worker 子入口，防止首次打开课件触发优化重载而丢失测试宿主。

## 交付状态

源码 `b2095a6978e6a1b072ac691ef9314480462354cb` 已推送 main。桌面 `v0.1.71` 已作为 Latest 发布，7 个资产；Android `android-v0.1.71` 已作为预发布发布，2 个原证书非调试 APK/code71。两标签均指向该源码，发布后 API 已核对全部文件名、大小、状态和 Latest 指向。

Windows 从同一源码的 git archive 在 OMEN 临时目录通过 npm ci 和完整构建，NSIS 的 ProductVersion 为 0.1.71.0。实际 Windows Electron 包通过与 Mac 相同的两种格式、图片/表格、搜索、右侧栏、反色恢复、Ctrl+滚轮和只读字节验收，renderer/控制台错误均为零。Windows 原生证据位于 `C:/Users/Meta/AppData/Local/Temp/.agents/presentation-native-w9GSk8/evidence`。

Android 两 APK 的 applicationId 分别为 `io.github.alexbeatsz.webobsidian` 与 `io.github.alexbeatsz.webobsidian.debug`，versionName 0.1.71、versionCode71，均无 debuggable 标志。两证书与 0.1.70 对应原包一致，16KiB zipalign 验证通过。Android 实机显示、触摸与长期运行尚未验收。

| 资产 | 字节 |
| --- | ---: |
| Mac arm64 DMG | 166657955 |
| Mac arm64 ZIP | 160535867 |
| Mac ZIP blockmap | 167486 |
| latest-mac.yml | 362 |
| Windows x64 NSIS | 130078031 |
| Windows NSIS blockmap | 135503 |
| latest.yml | 370 |
| Android 手机 APK | 135869550 |
| Android 平板 APK | 135869558 |

本地按平台保留 0.1.71 交付物。临时签名输入、研究源码及 Windows 隔离构建目录已清理。
