import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Presentation } from '@web-ppt/core';

const fixture = vi.hoisted(() => ({ read: vi.fn(), parse: vi.fn(), parseWorker: vi.fn() }));
vi.mock('../api', () => ({ requestBinary: fixture.read }));
vi.mock('@web-ppt/core', () => ({ parse: fixture.parse, parseInWorker: fixture.parseWorker, renderSlideToSvg: vi.fn(), slideText: () => '' }));
import { PptResource } from './resource';

const resources: PptResource[] = [];
const open = () => { const resource = new PptResource('slides.ppt', 'vault-A', '/scoped'); resources.push(resource); return resource; };
const presentation = (): Presentation => ({ width: 960, height: 720, slides: [{ elements: [], background: null }], source: 'ppt', dispose: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  fixture.read.mockResolvedValue(new Uint8Array([0xd0, 0xcf]).buffer);
  fixture.parse.mockResolvedValue(presentation());
});
afterEach(async () => { await Promise.all(resources.splice(0).map(resource => resource.destroy())); vi.unstubAllGlobals(); });

it('reads binary bytes through the identity-scoped request and disposes the parsed document once', async () => {
  const resource = open();
  await expect(resource.ready).resolves.toEqual({ numPages: 1 });
  expect(fixture.read).toHaveBeenCalledWith('/scoped', { vault: 'vault-A', signal: resource.lifetime.signal });
  expect(fixture.parse).toHaveBeenCalledWith(new Uint8Array([0xd0, 0xcf]).buffer);
  expect(resource.pageRatio).toBe(0.75);
  const value = await fixture.parse.mock.results[0].value;
  await resource.destroy(); await resource.destroy();
  expect(value.dispose).toHaveBeenCalledTimes(1);
});

it('disposes a late binary parse after its last reader closes', async () => {
  let finish!: (value: Presentation) => void;
  fixture.parse.mockReturnValue(new Promise<Presentation>(resolve => { finish = resolve; }));
  const resource = open();
  const ready = expect(resource.ready).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(fixture.parse).toHaveBeenCalledTimes(1));
  await resource.destroy();
  const value = presentation(); finish(value); await ready;
  expect(value.dispose).toHaveBeenCalledTimes(1);
});

it('cancels PPTX worker parsing and disposes any late asset response', async () => {
  fixture.read.mockResolvedValue(new Uint8Array([0x50, 0x4b]).buffer);
  let finish!: (value: Presentation) => void;
  fixture.parseWorker.mockReturnValue(new Promise<Presentation>(resolve => { finish = resolve; }));
  const terminate = vi.fn();
  vi.stubGlobal('Worker', class extends EventTarget { terminate = terminate; });
  const resource = open();
  const ready = expect(resource.ready).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(fixture.parseWorker).toHaveBeenCalledTimes(1));
  await resource.destroy(); await ready;
  const value = presentation(); finish(value); await Promise.resolve();
  expect(terminate).toHaveBeenCalled(); expect(value.dispose).toHaveBeenCalledTimes(1);
});

it('rejects an empty document and releases its assets', async () => {
  const value = presentation(); value.slides = [];
  fixture.parse.mockResolvedValue(value);
  await expect(open().ready).rejects.toThrow('没有可显示的幻灯片');
  expect(value.dispose).toHaveBeenCalledTimes(1);
});
