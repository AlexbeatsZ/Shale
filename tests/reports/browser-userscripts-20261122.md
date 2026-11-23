# 用户脚本更新、卸载清理与单页交换 — 2026-11-22

## 范围与实现

桌面 Shale 0.1.82，Electron 33.4.11。修复内置浏览器脚本使用 GitHub Release 更新地址时的 `Redirect was cancelled`；卸载立即删除 GM 数据；加载旧存储清理卸载残留。标签快速交换只影响两个单独页面，包括可见及暂存的分屏成员；停留插入排序仍整体移动分屏组。

`session.fetch({redirect: 'manual'})` 在该 Electron 版本收到跳转时拒绝 Promise。改为同一 session 的 `net.request`，在 redirect 事件读跳转并取消该 hop，逐跳校验后重新发起请求。request 的 close 可能先于 response 的 end，不能用 request close 判读响应失败；完成条件是 response end，错误/abort/总超时负责失败。

## 自动验证

- `npm run build` 与 desktop/web/server TypeScript 通过。
- `npx vitest run --testTimeout=30000`：109 文件、619 项通过。
- `node tests/desktop-userscripts.mjs`：真实 Electron 网络与存储隔离测试通过，覆盖相对/跨源跳转、逐跳拒绝、敏感头移除、303/307 方法/请求体、HEAD/304、长度与流式上限、响应头/响应体超时、abort、cookie 省略/包含、历史孤立值清理及更新安装保留值。
- `RENDER_TEST_SKIP_CORE_BUILD=1 RENDER_TEST_BROWSER='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npx playwright test --project=render tests/browser/split-editing.spec.ts`：45 项通过。新增可见组成员与单页双向交换、暂存组成员交换；验证另一分屏页面不动、插入仍整体移动。
- `node tests/desktop-webviewer.mjs desktop/release/0.1.82/mac-arm64/Shale.app/Contents/MacOS/Shale`：完整通过。URL 导入/更新使用 302 夹具；新增真实 GM 值卸载删除、重新导入新 ID/空值断言，保留一分钟真实自动更新、权限审阅、主页/双侧栏、隔离、布局恢复与正常退出。
- macOS 第一轮被并行打包覆盖正在运行的测试 app 中断；第二轮被切换前台应用影响原生键盘焦点；打包完成、保持测试前台后完整通过。这两次不是产品成功证据。

## 真实来源与本机部署

- 用修复后的 Electron 下载器请求实际 ALR GitHub latest metadata 和完整 user.js，均 HTTP 200，最终主机 release-assets.githubusercontent.com，版本 0.3.0，完整源码 prepareBundle 通过。
- 正常退出日用应用后原位安装 `/Applications/Shale.app` 0.1.82；固定 `Local Development Code Signing`，identifier `com.xnohat.webobsidian`，`codesign -d -r-` 含 certificate leaf，deep/strict 校验通过；本机 `/healthz` 返回 200，原工作区恢复。
- Mac STEM 当前仍安装 ChatGPT Copy Fix 与 ChatGPT Advanced LaTeX Renderer。已删除历史卸载的 Proxy Timezone Sync（3 项 GM 值）及 Element Hider（空值）的孤立值桶与 retained 身份索引；回读孤立值 0、retained 不存在，当前两脚本数据保留。
- 在真实设置页重新检查 ALR 更新，旧 error 清除，状态 approval-required，待更新版本 0.3.0。其正向匹配从两个 ChatGPT 地址扩展到 38 项 AI 站点规则，原机制要求用户审阅，不代为扩大授权，已安装脚本仍为 0.2.1。
- Windows x64 在 OMEN 的临时隔离 archive 中构建 NSIS 与 blockmap/latest，ProductVersion 为 0.1.82.0；未进行 Windows 实机界面操作或安装。

## 边界

没有验收 Windows/Android 触控；没有修改原 Obsidian 插件迁移源，也没有改代理配置。macOS 原位安装与正常脚本更新检查已验证；不把“需要审阅扩大匹配范围”记为下载错误。

## 发布

桌面 v0.1.82 已正式发布，目标 52b70d05f621d477b4b71fdee313646bd289d442，7 资产名称与大小均和本地交付文件一致。Mac arm64 提供 DMG、ZIP、blockmap、latest-mac；Windows x64 提供 NSIS、blockmap、latest。Windows 临时构建源及任务脚本已清理，安装包转回 Mac 后由已认证 Mac 上传；Windows 主机的过期 GitHub 认证未改动。Mac 旧应用临时副本和 0.1.80 旧本地构建已删除。
