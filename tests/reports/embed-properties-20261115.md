# 图片属性、CSS 迁移与阅读缩放验收

2026-11-15，目标版本 0.1.70 / Android code 70。

## 源码与模型

- Wiki 与 Markdown 图片共用 `alias#width=320#dark` 参数模型，支持 dark、width、height、scale、align、full、fit。
- 图片按完整来源模型的 H1 章节编号，空图片章节跳过，重复嵌入分别占号。图片引用覆盖省略别名、空别名和显式别名。
- GFM TableCell 的 `\|` 分隔、旧尺寸、未知属性和转义保留，表格属性编辑通过父事务写回。
- 实际 exTable 配置使用明确的 TableCell 来源范围，重复文本的图片单元格保持各自编号。能力字段让旧客户端继续使用双参数渲染语义。
- HTML `<img>` 沿用净化和 alt/文件名说明。跨文档多个来源的图片引用回退原链接文字。

## 自动检查

- 全量 Vitest 104 文件、595 项通过。
- server、web、desktop 三端类型检查通过。
- 生产 `npm run build`、桌面 standalone bundle 检查与 macOS arm64 目录打包通过。
- 75 项相关浏览器回归通过，其中图片/主题 20 项在最终打印规则调整后再次通过。
- 覆盖数值/枚举/布尔菜单、悬停/键盘/小屏点击、属性撤销、复杂 CSS 热更新与打印、灰色/彩色背景白像素与红色身份、图注/引用、表格/exTable、分屏异步粘贴、PDF/连续 PDF 指针锚点/横向可达/重挂倍率、MD 开关默认关闭/启用/保存，以及内容引用和渲染生命周期。新增延迟前章加载时按住 Control、React 高度延后提交及页目标/前章两种加载顺序的回归。原缩放换章重挂用例最终重复 10 轮通过，另外四个时序用例各重复 3 轮通过。同步测量引用保留同批高度更新，布局提交后再补偿前章，明确页导航沿用同一目标。

浏览器结果保留于 `/tmp/.agents/webobsidian-image-table-final` 与
`/tmp/.agents/webobsidian-media-regression-20261115`。

## 用户配置与源图

实际 STEM Hider 已由 231 行减为 13 行，Theme 由 508 行减为 174 行。
14 张 Wiki SVG 已按用户决定直接改色，279 个矢量元素的几何、文本、尺寸、透明属性通过对照。
详细保留依赖、原色/新色和逐图检查见 `css-migration-20261115.md`。

## 原生生产验收

通过临时原生验收发现首列图片的百分比最大宽度会把 100/150px 压为约 85px，已限定表格显式宽度以固有尺寸展开，并补浏览器回归。
`tests/desktop-image-properties.mjs` 已在最终 0.1.70 arm64 生产包用两轮独立 profile 完成严格验收。独立 profile/Vault
复制当前 Theme/Hider、实际 exTable 配置、真实晶格表与 14 张源 SVG，所有 UI 操作和文件修改留在临时 Vault。

- 14 张图的 100/150px 尺寸、连续图号、合并表头和原单元格列位置通过。
- 属性菜单、自定义 CSS、别名引用、预览和 MD 设置通过。
- 暗底白像素为 `[30,30,30]`，与纸张背景一致，红像素为 `[255,128,116]`。
- 独立 PDF 与连续 PDF 均完成实际 Ctrl 滚轮和滤镜命令操作。连续 PDF 放大至 1.822 倍，连续 8 帧指针锚点稳定，最终水平误差 0.3984px、垂直误差 0.6910px，切换 dark 前后页面几何一致，滚动变化为 (0,0)。
- PDF 文字层的 Page 1 实际位于视口，截图文字区域亮像素 7264/35828，实际图像与 PDF 文件字节通过前后对照。
- rendererErrors 为空，PDF.js 记录已有 fake-worker 提示。

验收结果与截图目录为 `/tmp/.agents/webobsidian-native-0.1.70-final`。

## 交付

源码提交 `b0a399fe2f9a9b5fce35a16d693837876e7d59d0` 已推送 main。
Mac arm64 DMG/ZIP 和两 Android APK 构建通过，Mac 包 codesign deep/strict 验证通过。
手机与平板签名均和 0.1.69 原包一致，applicationId 沿用原值，versionCode 70，均无 debuggable 标志。
Android 临时签名输入、隔离源码及旧 APK 中间输出已清理，仅保留当前交付物。
Windows x64 已由同一 SHA 的 git archive 隔离构建，安装包 ProductVersion 为 0.1.70.0，
安装包 129905719 字节、blockmap 135271 字节、latest.yml 370 字节，回传大小与远端 receipt 一致。
更新元数据 version/path/files.size 核对通过，沿用已有未配置代码签名的 Windows 发布设置。
OMEN 本轮隔离源码、依赖、中间包和脚本已删除，原仓库脏状态与缓存保留。
已发布桌面 `v0.1.70`（Latest，7 个资产）与 `android-v0.1.70`（预发布，2 个 APK）。
两标签都指向上述完整源码 SHA，发布后 API 核对 draft=false、预发布标志、全部文件大小及 Latest 指向通过。
桌面发布时间为 2026-11-15 17:21:40 UTC，Android 为 17:21:42 UTC。

| 资产 | 字节数 |
| --- | ---: |
| Mac arm64 DMG | 166487994 |
| Mac arm64 ZIP | 160343440 |
| Mac ZIP blockmap | 167263 |
| latest-mac.yml | 362 |
| Windows x64 NSIS | 129905719 |
| Windows NSIS blockmap | 135271 |
| latest.yml | 370 |
| Android 手机 APK | 135671603 |
| Android 平板 APK | 135671607 |
本轮自动验收使用临时数据。后续用户明确授权升级所有可连接设备，实际部署记录如下。

## 设备原位升级

2026-11-15，复用已发布的 0.1.70 交付物。

| 设备 | 升级结果 | 启动与数据检查 |
| --- | --- | --- |
| Mac arm64 | 0.1.69 → 0.1.70 | 正常退出后原位替换，codesign deep/strict 通过，原 Vault health200 且 PID90599 与端点一致，desktop-config/settings 字节保留 |
| OMEN x64 | 0.1.69.0 → 0.1.70.0 | 交互用户 NSIS exit0，新版进程运行，原 Vault health200 且 PID21052 与端点一致，desktop-config/settings 字节保留 |
| ROG x64 | 0.1.69.0 → 0.1.70.0 | 交互用户 NSIS exit0，新版进程运行，保留已有选库状态，desktop-config/settings 字节保留 |
| Redmi K70 | 待连接 | 本机、OMEN 均无现有 ADB transport，当前 Bonjour 广播的 LAN/Tailscale 调试端口均拒绝连接，已向用户询问当前无线调试地址 |
| Xiaomi Pad 6 Pro | 待连接 | ADB 与有界 Bonjour 发现未找到设备，未执行安装 |

Mac 当前运行的 0.1.70 已删除旧 Wiki 文件名滤镜，使用本次永久改色的源 SVG。
Mac staging/旧应用副本已清理。Windows 临时安装器、脚本、配置快照与一次性计划任务均已清理。
安装回执在 `/tmp/.agents/webobsidian-deploy-0.1.70/`。
本轮设备检查覆盖升级、启动与既有服务健康，Android 前台交互和跨设备 Vault 文件同步尚未验收。
