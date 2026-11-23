# Shale 完整身份迁移验收 — 2026-11-23

## 范围与发布

用户要求仓库、原生应用身份、数据目录、笔记父目录和所有有效启动/同步引用改为 Shale，并明确授权移动 Mac/Windows 笔记父目录与结束 OMEN 旧目录占用会话。第三方来源、许可证、插件 ID 和旧数据导入标识保持真实。

- 仓库：`AlexbeatsZ/Shale`；Mac 主检出 `/Users/meta/Developer/Shale`；OMEN 主检出 `C:\Users\Meta\Project\Workspaces\Shale`。OMEN 改名后干净 fast-forward；Mac 原有两个浏览器规格的未提交修改保留。
- 桌面 `v0.1.87`：Release 455636583，7 个资产，正式发布并设为 latest。Mac arm64 DMG/ZIP/blockmap/latest-mac；Windows x64 NSIS/blockmap/latest。源码目标 `5bfaf67d8e84c0f76d25a6d8fd1720aa59547147`；Windows 原生构建来自此前身份提交 `b9d50c0205f578dd7132f9faf790d77bab4012b3`，后续变化是同步服务入口与测试/说明。
- Android `android-v0.1.87`：Release 455636620，1 个 arm64 非调试生产证书 APK，预发布；源码 `b9d50c0205f578dd7132f9faf790d77bab4012b3`。新 applicationId 的两台设备均使用此 APK，不再需要旧包证书兼容变体。
- 同步服务 `sync-server-v0.3.0`：Release 455636650，ZIP/TAR/BUILD-INFO 共 3 资产；源码 `5bfaf67d8e84c0f76d25a6d8fd1720aa59547147`。包含固定 file-sync-core 运行时及许可证。
- 三个 Release 的资产名称/数量/大小已与本机上传清单核对，均已公开。历史 Release 保留。

## 验证

| 范围 | 结果 |
| --- | --- |
| server/web/desktop 类型与生产构建 | 通过 |
| 全量单元 | 640/640 |
| 旧 profile/Vault/作用域身份迁移 | 7/7：碰撞预检、拒绝符号链接、重启恢复、两类 snippets 合并、认证与源码保真、Windows root 大小写、历史版本与 CSS 选择器 |
| 相关浏览器 | 原 33 项中 31 首轮通过；Mac 两项 MCP 夹具修正实体键后，MCP 全 10 项复验通过 |
| 插件兼容 | 旧 `require('obsidian')` 的命令/设置/CM 扩展/代码块/卸载夹具通过；2 项可选真实插件测试因未提供插件跳过 |
| 独立同步服务 | 13/13；ZIP/TAR 解压启动 2/2；真实客户端同步 17/17 |
| Mac 实包 WebViewer | 完整通过：侧栏标签、导航、隔离、脚本导入/自动更新/权限审阅、布局及正常退出 |
| Mac 实包 MCP | 7 个 `shale_` 工具、HTTP、无 Node/PATH 的 stdio、加密凭据回读通过；配置/Vault 未被验收脚本改写 |
| Mac 签名 | 固定 Local Development Code Signing；identifier `io.github.alexbeatsz.shale`；指定要求含 certificate leaf，deep/strict 通过 |
| Windows | x64 NSIS 构建和 OMEN/ROG Session1 安装通过，ProductVersion 0.1.87.0 |
| Android | assembleRelease/lintVitalRelease 通过；新包名、code87、非 debuggable；两台现有 STEM 原生服务 healthz 200 |

浏览器首轮两项失败来自测试沿用 Control 而 Mac 命令已经使用 Command；ARM Chrome 包装规避已有 Rosetta 初始化慢问题。没有调整全局浏览器、运行时或代理。最新已有云端 MCP 连接的一次只读复验由外部网关返回 HTTP429，不能据此宣称云端连接验收通过；本机 HTTP/stdio 的实包验收独立通过。

## 各设备实际状态

| 设备 | 有效路径与状态 |
| --- | --- |
| Mac | `/Applications/Shale.app` 0.1.87；`~/Library/Application Support/Shale`；`~/Documents/Shale/STEM`、`.shale/`；healthz200；主题 shale-dark；同步 idle/完成、0 冲突 |
| OMEN | `%LOCALAPPDATA%\Programs\Shale\Shale.exe` 0.1.87；`%APPDATA%\Shale`；`Documents\Shale\STEM`；healthz200；旧主源码目录不存在，新主检出已连接新 origin |
| ROG 桌面 | 相同安装/profile/笔记父目录迁移；0.1.87 已启动，保持迁移前未选 Vault 的状态，没有假称桌面本地服务已启动 |
| ROG 同步服务 | 任务 ShaleNativeSync；代码 `%LOCALAPPDATA%\Programs\ShaleSyncServer`；数据 `%LOCALAPPDATA%\ShaleSync\.local\native-sync`；0.3.0 已运行，workspaceId `76fcca29-885b-4dd1-832e-cfac4f07cc09` 保持 |
| K70 / 小米平板 6 Pro | `io.github.alexbeatsz.shale` 0.1.87/code87；私有运行数据迁到新包，Documents/Shale/STEM 与 .shale；两机新服务启动并索引成功。完整同步/界面验收由用户明确延后 |

同步入口统一为 `http://100.106.169.46:18744/shale-sync/v1/`。ROG workspace 身份、令牌、blob、版本与回执保持；最后核对 revision470，旧目录的 15 个 manifest 条目均为 hash=null 的删除墓碑，旧路径活文件为 0。墓碑是同步历史，不应清除。Mac/OMEN/ROG 的个人 CSS 原生类名已更新；Android 当时没有这两份 CSS，未创建空替代文件。

OMEN 当前保留 5 项真实配置冲突：`.shale/appearance.json`、`bookmarks.json`、`hotkeys.jsonc`、`snippets/Hider.css`、`snippets/Theme.css`。本机和远端两版已保存，尚未擅自选择。旧路径 personal-latex.js 的远端内容已证明存在于新路径，重新检查后旧路径冲突消失。

## 恢复与验收边界

- Android 改包名是新安装，不能用 APK 原位升级解释。旧包已 disabled-user，保留至新包完成用户验收；没有卸载/清空旧包。文件 chown 后须匹配新进程实际 SELinux MCS 分类；通用 restorecon 不足以迁移 shared_prefs。未关闭或放宽 SELinux。
- Mac 旧加密钥匙串项保留，Shale 服务已获取同一安全存储密钥，并使用有固定证书的迁移助手；没有输出密钥。旧应用、旧构建及相同旧系统偏好转到 `/tmp/.agents/shale-identity/.trash`，没有删除原数据。
- OMEN 临时构建的 `.signing` 副本已按构建规约清除；原密钥保留在常规项目。PowerShell Move-Item 对隐藏 .git 产生部分移动后，使用 .NET 同盘目录移动补齐，再检查 Git 干净和 fast-forward。
- Mac 剩余 LaTeX 颜色 worktree 已修复原主目录移动造成的 .git 反向指针，并将末级目录及管理名改为 Shale；没有改写其历史源码。
- MCP 客户端应刷新服务工具列表以获取 `shale_` 前缀；外部连接的显示名/缓存不是本机配置文件。现有连接的云端复验遇 HTTP429，仍待后续确认。
- 用户指定 Android 完整验收稍后；OMEN 配置冲突审阅和旧 Android 回滚包的最终清理仍留待确认。

原始构建、验收和迁移证据位于 Mac `/tmp/.agents/shale-identity/`；可持续恢复状态见 `~/.agents/shale--identity-migration/AGENTS.md`，该目录同步到 dot-agents。
