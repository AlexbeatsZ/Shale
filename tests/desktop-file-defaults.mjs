import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { _electron as electron, expect } from '@playwright/test';
const root=process.env.SHALE_ACCEPTANCE_OUTPUT;
const executablePath=process.argv[2];
if(!executablePath)throw new Error('Usage: node tests/desktop-file-defaults.mjs <packaged executable>');
if(root)await fs.mkdir(root,{recursive:true});
const base=path.join(os.tmpdir(),'.agents');await fs.mkdir(base,{recursive:true});
const fixture=await fs.mkdtemp(path.join(base,'shale-file-defaults-'));
const vault=path.join(fixture,'vault'),profile=path.join(fixture,'profile');
await fs.mkdir(path.join(vault,'Inbox/Nested'),{recursive:true});await fs.mkdir(profile);
await fs.writeFile(path.join(profile,'keychain-migrated-v1'),'isolated acceptance');
await fs.writeFile(path.join(profile,'desktop-config.json'),JSON.stringify({vaultPath:vault,trustedPlugins:false}));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
 app=await electron.launch({executablePath,args:[`--user-data-dir=${profile}`,'--use-mock-keychain'],env,cwd:fixture,timeout:120000});
 const page=await app.firstWindow();
 await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//,{timeout:120000});
 await expect(page.locator('.workspace-launcher').first()).toBeVisible({timeout:60000});
 const version=await app.evaluate(({app})=>app.getVersion());
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('button',{name:'文件与链接',exact:true}).click();
 await page.getByRole('combobox',{name:'新建文件的默认位置',exact:true}).selectOption('folder');
 await page.getByRole('combobox',{name:'选择已有文件夹',exact:true}).selectOption('Inbox/Nested');
 await expect(page.getByRole('combobox',{name:'新建文件夹路径',exact:true})).toHaveValue('Inbox/Nested');
 await page.getByRole('button',{name:'保存默认位置',exact:true}).click();
 await expect.poll(()=>page.evaluate(async()=>(await(await fetch('/api/settings')).json()).vault.newFileFolder)).toBe('Inbox/Nested');
 if(root)await page.screenshot({path:path.join(root,'default-new-file-folder.png')});
 await page.getByRole('button',{name:'关闭设置',exact:true}).click();
 await page.locator('.workspace-launcher').first().getByRole('button',{name:'新建笔记'}).click();
 await expect(page.locator('.main-pane [data-document-id]').first()).toHaveAttribute('data-document-id','Inbox/Nested/Untitled.md');
 assert.equal((await fs.stat(path.join(vault,'Inbox/Nested/Untitled.md'))).isFile(),true);
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('button',{name:'文件与链接',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'新建文件的默认位置',exact:true})).toHaveValue('folder');
 await expect(page.getByRole('combobox',{name:'新建文件夹路径',exact:true})).toHaveValue('Inbox/Nested');
 console.log(`PASS packaged ${version} (${process.platform}): existing folder selected, settings saved/reopened, note created at Inbox/Nested/Untitled.md`);
 if(root)await fs.writeFile(path.join(root,'file-defaults-result.json'),JSON.stringify({version,ok:true,settings:'文件与链接 / 默认位置 / 新建文件的默认位置',folder:'Inbox/Nested',created:'Inbox/Nested/Untitled.md'}));
} finally {
 if(app){await app.evaluate(({app})=>{setImmediate(()=>app.quit());}).catch(()=>{});await app.close().catch(()=>{});}
 await fs.rm(fixture,{recursive:true,force:true});
}
