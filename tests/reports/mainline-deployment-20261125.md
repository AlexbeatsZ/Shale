# Claude 分支合并、0.1.94 发布与部署验收

日期：2026-11-25（America/Los_Angeles）。运行源码：`0dd7e6dab6a9e3e379f4536d35c64d4b83d4d341`，已推送 `origin/main`。

## 合并范围

main 先快进到已验收的 `f0baa07`（包含0.1.93、行号/公式tag清理、同步活性修复），再以保留历史的 merge 合入 `claude/intelligent-goldwasser-8f668d` 的 `1c0d17a` 与 `23dd1ae`。两次 Claude 提交均为 main 的祖先；未改写分支历史。

冲突处理同时保留：固定链接/系统定位菜单按来源保护；正文菜单按文档与选区保护，允许焦点和装饰事务；菜单异步粘贴保留点击位置；公式粘贴清理、Shale 身份、Vim 共享撤销及最近连续文档修复。旧测试中的 Android UA 改为 ShaleAndroid，未恢复旧应用身份。

## 验证

- server/web/desktop 类型检查、114文件658单元全部通过。
- 31项相关浏览器通过：触摸6项、内容剪贴板、宿主桥、Vim、连续文档、公式粘贴/标题/行号。首轮 universal Chrome 在导航超时，使用 arm64 入口完整重跑通过。
- Mac/Windows 最终0.1.94正式包均通过五组原生回归：clipboard、webviewer-lifecycle、webviewer、presentations、virtual-documents。覆盖用户脚本导入/自动更新/权限、工作区保存、PDF真实系统定位与反色关闭记忆。Mac 完整 WebViewer 首轮在访客焦点检查未通过，单独完整重跑通过。
- Mac 固定 `Local Development Code Signing`、identifier `io.github.alexbeatsz.shale`，指定要求含 certificate leaf，deep/strict 校验通过。
- Android `assembleRelease` / `lintRelease` 成功；原生产证书、V2签名、非调试arm64、16KB对齐检查通过，applicationId `io.github.alexbeatsz.shale`，versionCode94。

## 发布

- 桌面 `v0.1.94` / Release458338595：七资产公开，latest指向0.1.94。
- Android `android-v0.1.94` / Release458339030：生产签名APK公开预发布，供当前两台正式包设备使用；旧.debug兼容变体本轮未重建。
- 两个标签均指向运行源码0dd7e6d。资产名称、大小和上传状态与本地产物核对。
- GitHub部分创建/上传/发布请求返回500，读取实际状态避免重复上传；先建明确源码标签、分离发布与latest更新后完成。

## 原位部署

用户明确授权「部署,之后更新不需要我授权」，后续Shale更新不再重复申请确认。安装保持原profile/Vault及设备身份。

| 设备 | 版本 | 验收 |
|---|---|---|
| Mac | 0.1.91 → 0.1.94 | 正常退出后替换应用；固定签名及deep/strict通过，启动与healthz200（56382），保存后的标签/活动项/侧栏及Vault一致 |
| OMEN | 0.1.90 → 0.1.94 | Session1安装器exit0，启动与healthz200（61822），Vault与保存后的标签/活动项一致 |
| ROG | 0.1.90 → 0.1.94 | Session1正常关闭、安装器exit0并启动，保留原先未选择Vault状态；无笔记服务，不把它计为healthz通过 |
| Redmi K70 | 0.1.90/code90 → 0.1.94/code94 | `adb install -r --user current`成功，首次安装时间不变、进程启动、healthz200（38693） |
| 小米平板6 Pro | 0.1.90/code90 → 0.1.94/code94 | 同样原位安装成功、首次安装时间不变、进程启动；写出服务端点（44069），healthz请求超时，未宣称服务健康通过 |

OMEN首次安装脚本因PowerShell5.1以系统编码读UTF8工作区JSON而在安装前停止；指定UTF8后重跑成功，未改写工作区。原有配置冲突未自动选择。Android长按/软键盘的完整实机手势与同步验收仍待用户在前台使用确认；安装成功不等于这些交互已验收。

证据：Mac `/tmp/.agents/shale-mainline-0.1.94` 的单元/浏览器/原生日志和部署JSON；OMEN `%LOCALAPPDATA%/Temp/.agents/shale-mainline-0.1.94-results` 原生日志，OMEN/ROG `shale-deploy-0.1.94/deployment.json`。临时签名材料、隔离Windows源码/任务/安装器及旧本地产物在保留当前正式包和证据后清理，历史GitHub Release保留。

本报告仅覆盖0dd7e6d运行源码；同期其他任务的标签颜色分组改动未进入本包。
