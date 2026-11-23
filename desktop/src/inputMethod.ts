import { execFile } from 'node:child_process';
import type { InputMethodRequest, InputMethodState, InputSource } from './inputMethodTypes';

export interface InputMethodBackend {
  list(): Promise<InputSource[]>;
  get(): Promise<InputMethodState>;
  select(state: InputMethodState): Promise<void>;
}

/** One native foreground lease, serialized across every split and renderer request. */
export class InputMethodService {
  private queue: Promise<unknown> = Promise.resolve();
  private lease?: { owner: string; previous: InputMethodState };
  constructor(private backend: InputMethodBackend, private foreground: () => boolean) {}
  list() { return this.backend.list(); }
  releaseAll(): Promise<void> {
    const pending = this.queue.catch(() => {}).then(() => this.restore());
    this.queue = pending;
    return pending;
  }
  update(request: unknown): Promise<void> {
    if (!request || typeof request !== 'object') return Promise.reject(new Error('Invalid input-method request'));
    const input = request as InputMethodRequest;
    if (typeof input.owner !== 'string' || !/^[\w:-]{1,128}$/.test(input.owner) ||
        !['normal', 'insert', 'release'].includes(input.mode) ||
        (input.englishSource !== undefined && (typeof input.englishSource !== 'string' || input.englishSource.length > 256)))
      return Promise.reject(new Error('Invalid input-method request'));
    const run = async () => {
      // Never send a queued switch into the app that replaced Shale in front.
      if (!this.foreground()) return;
      if (input.mode !== 'normal') {
        if (this.lease?.owner === input.owner) await this.restore();
        return;
      }
      if (this.lease && this.lease.owner !== input.owner) await this.restore();
      if (!this.foreground()) return;
      const sources = await this.backend.list();
      const english = input.englishSource ? sources.find(source => source.id === input.englishSource && source.english)
        : sources.find(source => source.english);
      if (!english) throw new Error('没有可用的英文输入源，请在设置 › 编辑器中选择已启用的英文布局');
      if (!this.lease) this.lease = { owner: input.owner, previous: await this.backend.get() };
      if (!this.foreground()) return;
      await this.backend.select({ source: english.id, open: false });
    };
    const pending = this.queue.catch(() => {}).then(run);
    this.queue = pending;
    return pending;
  }
  private async restore() {
    const lease = this.lease;
    if (!lease || !this.foreground()) return;
    await this.backend.select(lease.previous);
    if (this.lease === lease) this.lease = undefined;
  }
}

export function inputMethodBackend(binary: string, pid: number): InputMethodBackend {
  const run = <T>(action: string, state?: InputMethodState): Promise<T> => new Promise((resolve, reject) => {
    const args = action === 'list' ? [action] : [action, String(pid), ...(state ? [JSON.stringify(state)] : [])];
    execFile(binary, args, { timeout: 2500, maxBuffer: 128 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) { reject(new Error(stderr.trim() || `输入法切换失败：${error.message}`)); return; }
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('输入法助手返回了无效数据')); }
    });
  });
  return { list: () => run<InputSource[]>('list'), get: () => run<InputMethodState>('get'),
    select: async state => { await run('select', state); } };
}
