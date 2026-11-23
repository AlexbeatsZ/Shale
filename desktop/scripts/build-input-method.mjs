import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function buildInputMethod(platform = process.platform, arch = process.arch) {
  const output = path.join(desktop, '.gen', 'input-method', arch);
  mkdirSync(output, { recursive: true });
  copyFileSync(path.join(desktop, 'native/LICENSE.macism'), path.join(output, 'LICENSE.macism'));
  if (!['darwin', 'win32'].includes(platform)) return;
  if (platform !== process.platform) throw new Error('Build the input-method helper on its target OS');
  if (platform === 'darwin') {
    const binary = path.join(output, 'im-select');
    execFileSync('xcrun', ['swiftc', '-O', '-target', `${arch}-apple-macos11.0`,
      path.join(desktop, 'native/macos/main.swift'), path.join(desktop, 'native/macos/TSMUtils.swift'), '-o', binary], { stdio: 'inherit' });
    execFileSync('/usr/bin/codesign', ['--force', '--sign', 'Local Development Code Signing',
      '--identifier', 'com.xnohat.webobsidian.input-method', '--timestamp=none', binary], { stdio: 'inherit' });
    execFileSync('/usr/bin/codesign', ['-d', '-r-', binary], { stdio: 'inherit' });
  } else {
    const args = ['/nologo', '/EHsc', '/std:c++17', '/O2', '/MT', path.join(desktop, 'native/windows/main.cpp'),
      `/Fe:${path.join(output, 'im-select.exe')}`, `/Fo:${path.join(output, 'im-select.obj')}`, 'user32.lib', 'imm32.lib'];
    try { execFileSync('cl.exe', args, { stdio: 'inherit' }); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const vswhere = path.join(process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'Microsoft Visual Studio/Installer/vswhere.exe');
      const vs = execFileSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8' }).trim();
      if (!vs) throw new Error('MSVC C++ build tools are required');
      const vcvars = path.join(vs, 'VC/Auxiliary/Build/vcvars64.bat');
      const quote = value => `"${value.replaceAll('"', '')}"`;
      const script = path.join(output, 'build-helper.cmd');
      writeFileSync(script, `@echo off\r\ncall ${quote(vcvars)}\r\nif errorlevel 1 exit /b %errorlevel%\r\ncl.exe ${args.map(quote).join(' ')}\r\n`, 'ascii');
      try { execFileSync('cmd.exe', ['/d', '/c', script], { stdio: 'inherit', cwd: output }); }
      finally { rmSync(script, { force: true }); }
    }
  }
  copyFileSync(path.join(desktop, 'native/LICENSE.macism'), path.join(output, 'LICENSE.macism'));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildInputMethod();
