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

Mac arm64 和 Android 两非调试发布包已构建。Windows x64 构建与两组 Release 仍在收尾。Android 实机显示、触摸与长期运行尚未验收。
