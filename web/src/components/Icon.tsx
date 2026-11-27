/**
 * Material Symbols for application UI; custom/plugin glyphs retain their catalog.
 */
import type { CSSProperties } from 'react';

import { iconPaths } from '../lib/icons';
import { materialIconPaths } from '../lib/materialIcons';

export type IconName = keyof typeof iconPaths | string;

export default function Icon({
  name,
  size = 16,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const path = iconPaths[name] ?? iconPaths['file'];
  const material = materialIconPaths[name];
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={material ? '0 -960 960 960' : '0 0 24 24'}
      fill={material ? 'currentColor' : 'none'}
      stroke={material ? 'none' : 'currentColor'}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: material ?? path }}
    />
  );
}
