# 标签颜色分组、循环交换与复制标签页

日期：2026-11-25（America/Los_Angeles）。PRD 1.65，桌面/Android 0.1.95。运行源码 `12c2e08495ea0fd9d8bc614d85f1c9cae39e2b64`；后续提交只更新测试默认模式与交付记录，不改变包内运行代码。

## 交互与数据

- 中央、左侧、右侧标签栏均支持 Command 多选（非 Mac 为 Ctrl），依点击顺序追加选择。右键选中成员可对所选批次设置颜色，右键未选成员只作用于它。提供红、橙、黄、绿、蓝、紫、粉色及移出分组；左边界 3px 颜色描线与多选外框独立显示。
- 每个标签栏的同色为一个组；按加入顺序排序，手动移动/交换不改变序号。同色重复设置保留序号，退出后重新加入排到末尾。Option/Alt+Shift+Z/X 与上/下一成员交换，首尾循环；零/单成员无动作。中央复用拖放的单页交换和分屏保存屏障，不把整个分屏组一并替换；侧栏在同侧交换位置并让目标接替活动位置。
- 右键“复制标签页”在源标签旁插入独立标签。笔记/文件仍指向同一文件并复用 DocumentSession 正文和撤销；不生成文件副本。网页副本打开当前 URL、仅新建自己的访客；原页面不能重载。新副本默认未分组。
- 颜色、加入序号、副本身份、具体活动/分屏身份随既有工作区持久化；批选只保留在当前会话。旧布局兼容恢复，删除/重命名继续使用真实文件路径。

## 验证

| 范围 | 结果 |
|---|---|
| 类型与生产构建 | server/web 构建、desktop TypeScript 通过；两端原生打包通过 |
| 单元 | 115 文件、666 项通过；包含固定加入顺序、首尾循环、副本身份、共享会话、同路径分屏交换/关闭和工作区恢复 |
| Mac Chromium | 50 项通过：完整分屏编辑/排序/交换/关闭/路由、跨平台快捷键及4项新功能 |
| Windows Chromium | 4 项新功能全过，使用已有 Chromium，未另装浏览器 |
| Mac 正式包 | lifecycle 与 WebViewer 两组后台实包回归通过；开始与结束的窗口 visible/focused 均为 false，默认后台入口另复验通过 |
| Windows 正式包 | lifecycle、完整 WebViewer、presentations、virtual-documents、clipboard 五组全过；包含访客焦点下快捷键、Vim开关下剪贴板、PPT/PDF、原生文档定位/反色与独立编辑 |
| Android | 原生产签名的 assembleRelease/lintRelease 通过，V2 签名、arm64、16KB 对齐通过；versionCode95、applicationId `io.github.alexbeatsz.shale`，无 application-debuggable 标记 |
| Mac 签名 | 固定 Local Development Code Signing，identifier `io.github.alexbeatsz.shale`，designated requirement 含 certificate leaf，deep/strict 通过 |

原生生命周期专项检查每个原网页的 WebContents ID、页面随机实例、输入草稿、scrollY 和 history.state。拖动排序、交换、分屏/暂存恢复、分组快捷键及首尾交换后全部不变，三个源页面各加载一次；复制 `/one` 时只有该 URL 的加载数变成2，三个原访客状态继续保持，关闭副本后恢复3个访客。

首次整组分屏回归发现旧夹具仍使用 Control 主键、小写 Shift+z 和 `.shale/shale/writing.jsonc`，分别修正为当前平台主键、大写 Z 和 `.shale/writing.jsonc` 后50项全过。中间曾误将 core 构建与浏览器启动重叠，产生模块初始化错误；该轮废弃，生产构建完成后从新的 Vite 服务完整复验，未将中断轮计入通过结果。

## 前台占用与后台边界

旧 WebViewer 测试显式执行 `bringToFront()`、`window.focus()` 和 `app.focus({steal:true})`，并把普通 DOM 操作与原生焦点验收放在同一条流程。Mac 现默认后台运行这两组专项，`SHALE_TEST_BACKGROUND=0` 才进入前台全量路径；Windows仍默认全量，其他平台可设1后台。

只有独立 `--user-data-dir`、`--use-mock-keychain` 与 `--shale-test-background` 同时满足，应用才隐藏测试窗口，Mac采用 accessory 激活策略，并关闭该窗口的后台节流。日用启动不启用这些选项。

后台 WebViewer 明确排除原生访客焦点/`sendInputEvent` 与 Mac 原生全屏；这些结果不能视为Mac系统键盘、物理IME或全屏验收。Windows 本轮验证完整访客键盘路径；Mac本轮验证后台DOM操作、生命周期、脚本与恢复。

## 发布与部署

- 桌面 `v0.1.95` / Release458374241：7资产公开，latest确认指向该版本。
- Android `android-v0.1.95` / Release458383791：生产APK公开预发布。
- 两个标签均指向运行源码12c2e08，API逐项核对资产名称、大小和uploaded状态；未额外做无异常文件的哈希审计。

| 设备 | 版本 | 原位更新结果 |
|---|---|---|
| Mac | 0.1.94 → 0.1.95 | 正常退出、固定签名替换、后台启动；healthz200（49185），保存后的tabs/活动页/两侧/分屏及Vault均一致 |
| OMEN | 0.1.94 → 0.1.95 | Session1正常关闭、安装器exit0，启动与healthz200（62282）；Vault及标签/活动项保留 |
| ROG | 0.1.94 → 0.1.95 | Session1安装器exit0并启动，保留原未选Vault状态；没有笔记服务，不计为healthz通过 |
| Redmi K70 | 0.1.94/code94 → 0.1.95/code95 | `adb install -r --user current`成功，首次安装时间不变、进程2428启动、当前进程端点和healthz200（37817） |
| 小米平板6 Pro | 0.1.94/code94 → 0.1.95/code95 | 同样原位安装成功，首次安装时间不变、进程23697启动、当前进程starting端点34677存在；healthz仍超时 |

更新使用已记录的持续授权。未修改代理、未重新选库、未处理既有配置冲突；Android完整同步、触摸和界面交互继续按用户要求延期。平板安装成功不等于服务或交互通过。

证据：Mac `/tmp/.agents/shale-tab-groups-0.1.95`（browser-final、mac-webviewer*.log、各设备部署JSON、Release核对JSON）；OMEN `%LOCALAPPDATA%/Temp/.agents/shale-tabs-0.1.95-results` 保留构建/原生日志与acceptance.json，OMEN/ROG `shale-deploy-0.1.95/deployment.json`保留部署回执。仅保留最新0.1.95本地产物，旧0.1.93/0.1.94构建、本轮临时源码/archive、签名副本、安装器与计划任务已清理；历史GitHub Release和原生产签名材料保留。
