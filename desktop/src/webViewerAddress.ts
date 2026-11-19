export const webViewerPartition = 'persist:shale-webviewer';

export function parseWebViewerUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return;
  try {
    const url = new URL(value);
    if (!url.username && !url.password) return url;
  } catch {
    // An invalid address is not a navigation target.
  }
}
