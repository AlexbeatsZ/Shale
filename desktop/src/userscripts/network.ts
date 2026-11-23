import { net, session, type Session } from 'electron';
import { createHash } from 'node:crypto';
import { webViewerPartition } from '../webViewerAddress';

export interface FetchResult { status: number; statusText: string; url: string; headers: Record<string, string>; bytes: Buffer }
/** Electron 33 session.fetch rejects manual redirects instead of returning a 3xx response. */
function fetchHop(url: string, browsing: Session, options: {
  method: string; headers: Record<string, string>; body?: string; signal: AbortSignal; maxBytes: number; anonymous?: boolean;
}): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, session: browsing, method: options.method, redirect: 'manual',
      credentials: options.anonymous === false ? 'include' : 'omit' });
    let settled = false;
    const finish = (error?: unknown, result?: FetchResult) => {
      if (settled) return;
      settled = true;
      options.signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(result!);
    };
    const abort = () => { finish(options.signal.reason ?? new Error('Request aborted')); request.abort(); };
    request.on('error', error => finish(error));
    request.on('redirect', (status, _method, location, responseHeaders) => {
      // Never follow before scriptFetch has checked the destination and stripped credentials.
      const headers = Object.fromEntries(Object.entries(responseHeaders).map(([key, value]) => [key.toLowerCase(), value.join(', ')]));
      headers.location = location;
      finish(undefined, { status, statusText: '', url, headers, bytes: Buffer.alloc(0) });
      request.abort();
    });
    request.on('response', response => {
      response.on('error', error => finish(error));
      response.on('aborted', () => finish(new Error('Response aborted')));
      const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) =>
        [key.toLowerCase(), Array.isArray(value) ? value.join(', ') : value]));
      const tooLarge = () => { finish(new Error('Response exceeds size limit')); request.abort(); };
      if (Number(headers['content-length']) > options.maxBytes) { tooLarge(); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', chunk => {
        if (settled) return;
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (size > options.maxBytes) { tooLarge(); return; }
        chunks.push(bytes);
      });
      response.on('end', () => finish(undefined, { status: response.statusCode, statusText: response.statusMessage,
        url, headers, bytes: Buffer.concat(chunks) }));
    });
    options.signal.addEventListener('abort', abort, { once: true });
    if (options.signal.aborted) { abort(); return; }
    try {
      for (const [key, value] of Object.entries(options.headers)) request.setHeader(key, value);
      if (options.body !== undefined) request.write(options.body);
      request.end();
    } catch (error) { finish(error); request.abort(); }
  });
}
/** One bounded Electron transport for install, update, assets and GM requests. */
export async function scriptFetch(url: string, options: {
  method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal;
  timeout?: number; maxBytes?: number; allow?: (url: string) => boolean; session?: Session;
  anonymous?: boolean;
} = {}): Promise<FetchResult> {
  if (options.timeout !== undefined && (!Number.isFinite(options.timeout) || options.timeout < 0)) throw new Error('Invalid request timeout');
  const timeout = AbortSignal.timeout(Math.max(1, Math.min(options.timeout || 30000, 120000)));
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  let method = (options.method ?? 'GET').toUpperCase(), body = options.body, headers = { ...options.headers };
  for (let redirect = 0; redirect <= 8; redirect++) {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || (options.allow && !options.allow(url))) throw new Error('URL denied: ' + parsed.origin);
    const browsing = options.session ?? session.fromPartition(webViewerPartition);
    const response = await fetchHop(url, browsing, { method, headers, body, signal,
      maxBytes: options.maxBytes ?? 8 * 1024 * 1024, anonymous: options.anonymous });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location) throw new Error('Redirect has no Location');
      const next = new URL(location, url);
      if (next.origin !== parsed.origin) {
        headers = Object.fromEntries(Object.entries(headers).filter(([key]) => !/^(authorization|cookie|proxy-authorization)$/i.test(key)));
      }
      if ((response.status === 303 && method !== 'HEAD') || ([301, 302].includes(response.status) && method === 'POST')) {
        method = 'GET'; body = undefined;
        headers = Object.fromEntries(Object.entries(headers).filter(([key]) => !/^(content-type|content-length|content-encoding|content-language|content-location)$/i.test(key)));
      }
      url = next.href;
      continue;
    }
    return response;
  }
  throw new Error('Too many redirects');
}
export function verifyIntegrity(url: string, bytes: Buffer) {
  const hash = new URL(url).hash.slice(1);
  if (!hash) return;
  const m = hash.match(/^(sha256|sha384|sha512)[=-]([a-z\d+/=_-]+)$/i);
  if (!m) throw new Error('Unsupported asset integrity fragment: ' + hash);
  const actual = createHash(m[1].toLowerCase()).update(bytes);
  const hex = /^[a-f\d]+$/i.test(m[2]) && m[2].length === { sha256: 64, sha384: 96, sha512: 128 }[m[1].toLowerCase()];
  const expected = m[2].replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if ((hex ? actual.digest('hex') : actual.digest('base64').replace(/=+$/, '')) !== (hex ? expected.toLowerCase() : expected)) throw new Error('Asset integrity mismatch');
}
