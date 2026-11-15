import * as echarts from 'echarts';
import type { EChartsOption, SetOptionOpts } from 'echarts';
import { chartTheme } from './chartTheme';

export { echarts };
export interface ChartOptions {
  container?: HTMLElement;
  height?: number | string;
  renderer?: 'canvas' | 'svg';
  setOption?: SetOptionOpts;
}
export function chart(parent: HTMLElement, register: (cleanup: () => void) => void,
  option: EChartsOption, options: ChartOptions = {}) {
  const element = parent.ownerDocument.createElement('div');
  element.className = 'interactive-js-chart';
  element.style.height = typeof options.height === 'number' ? `${options.height}px` : options.height ?? '320px';
  (options.container ?? parent).append(element);
  const instance = echarts.init(element, chartTheme(element), { renderer: options.renderer ?? 'canvas' });
  const themeChanged = () => { if (!instance.isDisposed()) instance.setTheme(chartTheme(element)); };
  element.ownerDocument.defaultView!.addEventListener('widget-theme', themeChanged);
  let frame: number | undefined;
  const observer = new ResizeObserver(() => {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => { frame = undefined; if (!instance.isDisposed()) instance.resize(); });
  });
  // Register before setOption: malformed options must not leak a chart instance.
  register(() => {
    observer.disconnect();
    element.ownerDocument.defaultView!.removeEventListener('widget-theme', themeChanged);
    if (frame !== undefined) cancelAnimationFrame(frame);
    instance.dispose(); element.remove();
  });
  instance.setOption(option, options.setOption);
  observer.observe(element);
  return instance;
}
