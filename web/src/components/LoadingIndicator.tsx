import { createElement } from 'react';
import '@kyralabs/m3e-elements/loading-indicator.js';

/** Compose's seven-shape choreography, via the pinned M3E web port. */
export default function LoadingIndicator({ label = '正在加载', compact = false }: { label?: string; compact?: boolean }) {
  return <span className={`material-loading${compact ? ' is-compact' : ''}`}>
    {createElement('m3e-loading-indicator', { label })}
  </span>;
}
