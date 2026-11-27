import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(readFileSync(path.join(root, 'desktop/package.json'), 'utf8')).version;
if (process.platform !== 'darwin') throw new Error('This preview currently includes a macOS arm64 package only.');
const executable = path.join(root, `desktop/release/${version}/mac-arm64/Shale.app/Contents/MacOS/Shale`);
await access(executable).catch(() => { throw new Error(`Build the signed macOS preview first; see docs/design/material-expressive.md. Missing: ${executable}`); });
const base = path.join(os.tmpdir(), '.agents');
await mkdir(base, { recursive: true });
const temporary = await mkdtemp(path.join(base, 'shale-material-preview-'));
try {
  const vault = path.join(temporary, 'shale-preview'), profile = path.join(temporary, 'profile');
  await mkdir(vault); await mkdir(profile);
  await writeFile(path.join(vault, 'welcome.md'), '# 欢迎使用 Shale\n\n这里是 Material 3 Expressive 的独立预览工作区。\n\n## 从一页笔记开始\n\n- 打开文件，试试编辑与阅读模式。\n- 切换深浅色，查看导航与设置。\n- 新建网页标签页，让阅读与笔记相连。\n\n> [!info] 预览工作区\n> 这些示例内容位于临时目录，关闭此预览窗口后自动删除。\n');
  await writeFile(path.join(vault, 'research-notes.md'), '# 分子的世界\n\n从波函数出发，理解分子的结构与性质。\n\n## 变分原理\n\n试探波函数的能量期望值不会低于基态能量。\n\n## 下一步\n\n记录计算结果，整理文献，连接新的发现。\n');
  await writeFile(path.join(profile, 'desktop-config.json'), JSON.stringify({ vaultPath: vault, trustedPlugins: false }));
  console.log(`Opening Shale ${version}. Temporary preview: ${temporary}`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, [`--user-data-dir=${profile}`, '--use-mock-keychain'], { cwd: temporary, env, stdio: 'inherit' });
  const stop = () => child.kill('SIGTERM');
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => code === 0 || signal ? resolve() : reject(new Error(`Preview exited with code ${code}`))); });
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
} finally { await rm(temporary, { recursive: true, force: true }); }
