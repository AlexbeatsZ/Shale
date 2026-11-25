# 分组页面进入前台 — 2026-11-25

用户反馈 0.1.95 分组快捷键不可用，并明确要求把目标页面直接显示到当前正文。

## 根因与复现

上一版原生及浏览器新功能测试只覆盖分屏。`swapGroupedTab` 使用 `swapTabs`；单页时后者只重排标签，并不改变活动正文。

已在 0.1.95 固定签名正式包的隔离 Vault/profile 中通过真实菜单创建红组，按加入顺序 `two,one,three`，显示 one 后按 Option+Shift+X。断言期望 three，实际仍为 one，失败日志 `/tmp/.agents/shale-tab-foreground-0.1.96/reproduce-095.log`。窗口隐藏运行，未触碰日用工作区。

## 修复范围

单页沿用拖入正文的 showTab；分屏沿用当前栏 replacePane，目标在另一栏则交换两栏；侧栏直接选中目标。组内加入顺序与现有自定义快捷键 id 保留，命令标题改为显示上/下一个标签页。

新增测试直接断言正文和实际可见访客，连续前后循环不再通过点击标签替代；原生核对访客 id、页面随机实例、草稿、滚动、history 和请求计数。

## 当前验证

- server/web 生产构建及 web/desktop 类型通过。
- 115 文件、668 单元通过。
- 46 既有分屏/快捷键与6分组浏览器共52项通过。首次52项中旧复制测试在异步激活前读取activeTabId失败；补等待后6项完整重跑通过，未修改产品复制逻辑。
- Mac0.1.96正式包固定证书、identifier、certificate leaf、deep/strict通过；lifecycle与完整WebViewer后台回归均通过。新增访客sendInputEvent会检查真实before-input-event，然后断言当前可见网页；前进/后退各3次，宿主与访客两条路径均首尾循环。原网页各加载1次，复制one后仅one变为2次；原实例/草稿/scroll200/history均保留。
- Mac两组测试开始/结束窗口均visible=false、focused=false；未运行Mac物理按键、IME、原生全屏。Windows6分组浏览器与五组完整原生（lifecycle、WebViewer、presentations、virtual-documents、clipboard）全部通过；Android生产assembleRelease/lintRelease、原V2签名、arm64非调试与16KB对齐通过。
- 当前运行源码 `d9db5fbfc3e17b10793ddf5e6f6421ba50265781`；证据根 `/tmp/.agents/shale-tab-foreground-0.1.96/`。

## 发布与原位更新

桌面 v0.1.96 / Release458412240 已公开，latest确认，七资产名称/大小/uploaded状态通过。Android android-v0.1.96 / Release458416814 已公开预发布，生产APK一资产。两个标签都指向运行源码d9db5fbfc3e17b10793ddf5e6f6421ba50265781；未改写0.1.95标签。

| 设备 | 结果 |
|---|---|
| Mac | 0.1.95→0.1.96，固定签名/deep/strict，healthz56548通过，原Vault/标签/两侧/分屏保留 |
| OMEN | Session1正常关窗、NSIS退出0，0.1.96启动，healthz53731通过，Vault/标签保留 |
| ROG | Session1原位0.1.96安装退出0/启动，保留原未选Vault，无健康服务预期 |
| K70 | adb install -r --user current成功、0.1.96/code96、首次安装时间保留；进程10488与starting端点匹配，healthz先503后超时，未完成服务健康验收。只读日志显示本轮已扫描6624路径并解析250笔记，未解锁/重启/更改配置 |
| 小米平板6Pro | 同方式0.1.96/code96原位安装，首次安装时间保留；进程26572/starting端点匹配，healthz先503后超时，设备Dozing；服务与真实触摸/同步验收仍待完成 |

Android真实交互/完整同步仍遵循此前延期要求，本次未声称验收。两台设备的服务未就绪已明确留在AGENTS，不用安装成功代替服务健康。

保留证据 `/tmp/.agents/shale-tab-foreground-0.1.96/`，含旧版失败、最终单元/浏览器/Mac原生、Windows完整回归、Release核对与五设备回执；OMEN保留Temp/.agents/shale-tabs-0.1.96-results。交付后仅保留当前0.1.96构建，清理旧0.1.95本地构建、隔离源码/runtime/签名副本和一次性计划任务；保留原签名密钥、用户数据及历史Release。
