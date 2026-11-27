import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { defaultPort, prefix } from './protocol.mjs';
import { parseBackupOptions, runBackup, startBackupSchedule } from './backup.mjs';
import { lifecycleCli } from '@alexbeatsz/file-sync-core';

const backupModes = { '--backup-once': false, '--backup-dry-run': true };

export async function runCli(createSyncServer, args = process.argv.slice(2), env = process.env) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node sync-server/server.mjs [config.json]\n       node sync-server/server.mjs --backup-once|--backup-dry-run config.json\nEnvironment: SHALE_SYNC_DATA, SHALE_SYNC_TOKEN, SHALE_SYNC_HOST, SHALE_SYNC_PORT\nRelative dataDir remains relative to the current working directory. Default: 127.0.0.1:18744\nOptional config "gitBackup": {repository, remote, branch, intervalSec, authorName, authorEmail}; Git credentials come from the host credential helper.');
    return;
  }
  if (args.length === 1 && args[0] === '--version') {
    console.log(JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8')).version);
    return;
  }
  const mode = args.length === 2 && Object.hasOwn(backupModes, args[0]) ? args.shift() : undefined;
  if (args.length > 1 || args[0]?.startsWith('-')) throw new Error('Expected a configuration file path; use --help');
  const settings = args[0] ? JSON.parse(await readFile(path.resolve(args[0]), 'utf8')) : {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid sync configuration');
  const root = path.resolve(settings.dataDir ?? env.SHALE_SYNC_DATA ?? './data');
  const backup = settings.gitBackup === undefined ? undefined : parseBackupOptions(settings.gitBackup, root);
  const lifecycle = { backup: settings.backup, history: settings.history, garbageCollection: settings.garbageCollection };
  if (mode) {
    if (!backup) throw new Error('Configuration has no gitBackup section');
    // Reads sync data only; safe while the server runs (runs share one repository lock).
    try {
      const result = await lifecycleCli({ root, token: settings.token ?? env.SHALE_SYNC_TOKEN,
        baseUrl: `http://${settings.host ?? env.SHALE_SYNC_HOST ?? '127.0.0.1'}:${settings.port ?? env.SHALE_SYNC_PORT ?? defaultPort}${prefix}/`,
        configuration: lifecycle }, ['git-backup', ...(backupModes[mode] ? [] : ['--apply'])]);
      console.log(JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      // An operator-run command; Git diagnostics never contain the sync token.
      console.error('Shale sync backup failed:', error.message);
      throw Object.assign(error, { code: error.code ?? 'backup_failed' });
    }
  }
  const port = Number(settings.port ?? env.SHALE_SYNC_PORT ?? defaultPort);
  const host = settings.host ?? env.SHALE_SYNC_HOST ?? '127.0.0.1';
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid sync port');
  if (typeof host !== 'string' || !host.trim()) throw new Error('Invalid sync host');
  let service;
  const core = await createSyncServer({
    root,
    token: settings.token ?? env.SHALE_SYNC_TOKEN,
    lifecycle,
    maintenanceActions: {
      ...(backup ? { 'git-backup': dryRun => runBackup({ dataRoot: root, options: backup, dryRun }) } : {}),
      shutdown: async dryRun => {
        if (!dryRun) setTimeout(() => void service.close().catch(() => { process.exitCode = 1; }), 50);
        return { accepted: !dryRun, dryRun };
      },
    },
  });
  let schedule;
  service = { ...core, async close() { await schedule?.close(); return core.close(); } };
  const signals = ['SIGINT', 'SIGTERM'];
  const removeSignals = () => {
    for (const signal of signals) process.removeListener(signal, stop);
  };
  const stop = () => service.close().catch(() => { process.exitCode = 1; }).finally(() => {
    removeSignals();
  });
  try {
    await new Promise((resolve, reject) => {
      service.server.once('error', reject);
      service.server.listen(port, host, resolve);
    });
    service.server.on('error', () => { process.exitCode = 1; void stop(); });
    service.server.once('close', removeSignals);
    for (const signal of signals) process.once(signal, stop);
    console.log(`Shale sync listening on ${host}:${service.server.address().port}${prefix}`);
    if (backup) schedule = startBackupSchedule({ dataRoot: root, options: backup,
      run: () => core.maintenance('git-backup', false) });
  } catch (error) {
    await service.close();
    throw error;
  }
  return service;
}
