# Material 3 Expressive 实验前端验收 — 2026-11-26

## 交付范围

- 独立分支 `codex/material-3-expressive`，从已提交的 `0bec966` 开始；主检出同时进行的标签布局/服务器任务不混入此实验。
- PRD 1.77；Mac arm64 预览版本 `0.2.0-expressive.1`，保持原生 identifier `io.github.alexbeatsz.shale`。
- 共享渲染器采用 Google M3 颜色角色、Roboto/Noto 字体、Material Symbols Rounded、标准字阶/圆角/状态反馈，重做主页、双侧导航、标签、搜索/命令面板、设置与公共控件。文档排版保留用户设置。
- 主页仍通过原命令新建/打开文件、网页与图谱；最近文件只显示工作区内真实存在的条目。两侧主页提供相同动作。
- Expressive Loading Indicator 使用锁定的 M3 Expressive Web 1.8.0 移植，笔记打开与同步忙碌时显示；减少动态效果时冻结。
- 本轮只提供独立 Mac 预览，既有日用安装与设备配置未切换。Android/Windows 未构建或真机验收。

## 验证

| 检查 | 结果 |
| --- | --- |
| search-core/markdown-core、server、web 生产构建 | 通过 |
| desktop/web/server 类型检查 | 通过 |
| 浏览器回归 | 22/22：Material 新界面 3、标签分组 8、侧栏 4、命令面板 4、文件同步 3 |
| 最后布局复验 | Material 3/3，再验键盘 Tab、底部设置按钮可点击与状态栏层级 |
| 自适应 | 深浅色 320/390/840/1440 px，主页操作目标 ≥48px；1600px 编辑器双侧栏；窄屏设置不横向溢出 |
| 加载行为 | 真实 SVG 路径随帧变化；减少动态效果后形状与旋转稳定 |
| Mac 正式包签名 | `Local Development Code Signing`；`codesign -d -r-` 含固定 identifier 与 `certificate leaf`；deep/strict 验证通过 |
| Mac 实包 WebViewer | 通过主页动作、中央/两侧网页、访客隔离、历史导航、笔记拖放替换网页、用户脚本文件/URL 导入、自动更新/权限审阅、工作区恢复与正常退出 |
| 隔离预览入口 | `npm run preview:material`；临时 profile 与示例 Vault，关闭后删除；脚本语法检查通过 |

浏览器使用本机已有 Chrome，以 arm64 包装脚本启动；universal Chrome 直接启动曾使 harness 初始化超时，强制原生架构后专项约 6 秒、完整相关回归约 28 秒。

WebViewer 第一次实包运行在旧的固定 25% 横向坐标等待拖放指示器失败；该点被加宽的浮动侧栏覆盖。回归改为取可见网页左半部的坐标，继续验证实际笔记替换网页，完整重跑通过。

最后视觉检查还发现主题切换期间截图捕获了中间色；验收截图禁用有限 CSS 过渡以固定最终状态。底部状态栏层级降到浮动侧栏以下，并以真实点击左侧设置入口复验。

## 截图

所有截图来自真实组件与浏览器测试夹具；示例笔记不是用户的真实资料。

- [浅色主页](material-expressive-20261126/home-light-1440.png)
- [深色主页](material-expressive-20261126/home-dark-1440.png)
- [浅色编辑器与双侧导航](material-expressive-20261126/editor-light-desktop.png)
- [深色编辑器与双侧导航](material-expressive-20261126/editor-dark-desktop.png)
- [浅色设置](material-expressive-20261126/settings-light-desktop.png)
- [窄屏深色主页](material-expressive-20261126/home-dark-390.png)
- [窄屏设置](material-expressive-20261126/settings-light-compact.png)

## 边界

- 本轮 Mac 实包使用后台模式；没有把原生访客物理焦点、全屏、实体输入法或触摸体验记为通过。
- 次级对话框通过公共语义样式更新，未逐个完成视觉验收；第三方插件与用户 CSS 仍可定义自身外观。
- 官方 Material Web 没有被当成完整 Expressive 实现；加载组件来自明确标注的社区移植。此版本是按规范落实的实验版，不宣称官方实现或合规认证。
- 既有文档编辑、标签身份与同步协议没有设计变更，本轮未重复运行全量服务器/同步单元套件。

## 发布

已发布 `v0.2.0-expressive.1`，发行 ID `460125095`，源码目标 `5fdb4610bfcab2fe3b2a98275b38003eb921e185`。唯一资产 `Shale-0.2.0-expressive.1-mac-arm64.zip` 为 165,851,251 字节，GitHub API 核对 `state=uploaded`。标记 `prerelease=true`、`draft=false`，正式 latest 仍为 `v0.1.104`。最终 ZIP 对应的固定签名应用完整重跑 WebViewer 再次通过。

发行页：https://github.com/AlexbeatsZ/Shale/releases/tag/v0.2.0-expressive.1 。

本机包：`desktop/release/0.2.0-expressive.1/mac-arm64/Shale.app`；ZIP 位于同一版本目录。隔离预览命令为 `npm run preview:material`。
