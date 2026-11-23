import path from 'node:path';

// Central MIME map + media extension sets, shared by the authenticated file
// route, the public-share raw route and the SSR renderer. Keep the audio/video
// sets in sync with web/src/lib/media.ts (Shale parity).
const MIME: Record<string, string> = {
  // images
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // video
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg',
  '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  // audio
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.3gp': 'audio/3gpp',
  '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg',
};

export function mimeFor(p: string): string {
  return MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream';
}

export const VIDEO_EXT_RE = /\.(mp4|webm|ogv|mov|mkv)$/i;
export const AUDIO_EXT_RE = /\.(mp3|wav|m4a|3gp|flac|ogg|oga|opus)$/i;
