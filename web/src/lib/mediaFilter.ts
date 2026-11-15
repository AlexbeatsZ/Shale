type Rgb = readonly [number, number, number];
const hue180 = [-0.574, 1.43, 0.144, 0.426, 0.43, 0.144, 0.426, 1.43, -0.856];

/** CSS invert(p) followed by hue-rotate(180deg), with a per-channel paper colour. */
export function darkMediaMatrix(background: Rgb): number[] {
  return background.flatMap((channel, row) => {
    const value = channel / 255, scale = 2 * value - 1;
    return [...hue180.slice(row * 3, row * 3 + 3).map(coefficient => coefficient * scale), 0, 1 - value];
  }).concat([0, 0, 0, 1, 0]);
}

interface ThemeWatch { listeners: Set<() => void>; observe: (host: HTMLElement) => void; stop: () => void }
const watches = new WeakMap<Document, ThemeWatch>();
function subscribeTheme(doc: Document, host: HTMLElement, listener: () => void) {
  let watch = watches.get(doc);
  if (!watch) {
    const listeners = new Set<() => void>();
    let frame = 0;
    const changed = () => {
      if (frame) return;
      frame = doc.defaultView!.requestAnimationFrame(() => { frame = 0; listeners.forEach(callback => callback()); });
    };
    const observer = new MutationObserver(changed);
    observer.observe(doc.head, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'media', 'disabled'] });
    const theme = new MutationObserver(changed);
    const observed = new Set<Element>();
    const observe = (host: HTMLElement) => {
      for (const element of new Set([doc.body, host.closest('.theme-light,.theme-dark') ?? doc.body])) {
        if (observed.has(element)) continue;
        observed.add(element); theme.observe(element, { attributes: true, attributeFilter: ['class', 'style'] });
      }
    };
    observe(host);
    doc.addEventListener('load', changed, true);
    doc.defaultView!.addEventListener('embed-properties-changed', changed);
    watch = { listeners, observe, stop: () => {
      observer.disconnect(); theme.disconnect(); doc.removeEventListener('load', changed, true);
      doc.defaultView!.removeEventListener('embed-properties-changed', changed);
      if (frame) doc.defaultView!.cancelAnimationFrame(frame);
    } };
    watches.set(doc, watch);
  }
  watch.listeners.add(listener);
  return () => {
    watch!.listeners.delete(listener);
    if (!watch!.listeners.size) { watch!.stop(); watches.delete(doc); }
  };
}

function backgroundRgb(element: HTMLElement): Rgb {
  const doc = element.ownerDocument, canvas = doc.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return [30, 30, 30];
  const colors: string[] = [];
  for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
    // Native Callouts paint their surface in the spacing wrapper's pseudo-element.
    // Its text remains transparent so source prefixes keep their measured origin.
    if (parent.classList.contains('md-callout-spacing'))
      colors.push(doc.defaultView!.getComputedStyle(parent, '::after').backgroundColor);
    colors.push(doc.defaultView!.getComputedStyle(parent).backgroundColor);
  }
  context.fillStyle = '#fff'; context.fillRect(0, 0, 1, 1);
  for (const color of colors.reverse()) { context.fillStyle = color; context.fillRect(0, 0, 1, 1); }
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return [red, green, blue];
}

let nextFilter = 0;
/** The image/canvas paint consumes --embed-filter; captions and controls remain ordinary themed DOM. */
export function bindDarkMedia(host: HTMLElement, enabled: () => boolean, background: () => HTMLElement = () => host.parentElement ?? host) {
  const doc = host.ownerDocument, win = doc.defaultView!;
  let svg: SVGSVGElement | undefined, matrix: SVGFEColorMatrixElement | undefined;
  let stopped = false, printing = false;
  const id = `embed-dark-${++nextFilter}`;
  const paint = () => {
    if (stopped || !host.isConnected) return;
    watches.get(doc)?.observe(host);
    const paper = backgroundRgb(background());
    const dark = enabled() && !printing && paper[0] * 0.2126 + paper[1] * 0.7152 + paper[2] * 0.0722 < 128;
    host.style.setProperty('--embed-paper', `rgb(${paper.join(',')})`);
    if (!dark) { host.style.setProperty('--embed-filter', 'none'); return; }
    if (Math.max(...paper) - Math.min(...paper) <= 1) {
      host.style.setProperty('--embed-filter', `invert(${(1 - paper[0] / 255) * 100}%) hue-rotate(180deg)`);
      return;
    }
    if (!svg) {
      const ns = 'http://www.w3.org/2000/svg';
      svg = doc.createElementNS(ns, 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
      svg.setAttribute('aria-hidden', 'true'); svg.style.position = 'absolute';
      const filter = doc.createElementNS(ns, 'filter'); filter.id = id; filter.setAttribute('color-interpolation-filters', 'sRGB');
      matrix = doc.createElementNS(ns, 'feColorMatrix'); matrix.setAttribute('type', 'matrix');
      filter.append(matrix); svg.append(filter); host.append(svg);
    }
    matrix!.setAttribute('values', darkMediaMatrix(paper).map(value => Number(value.toFixed(9))).join(' '));
    host.style.setProperty('--embed-filter', `url("#${id}")`);
  };
  const beforePrint = () => { printing = true; paint(); };
  const afterPrint = () => { printing = false; paint(); };
  const stopTheme = subscribeTheme(doc, host, paint);
  const frame = win.requestAnimationFrame(paint);
  win.addEventListener('beforeprint', beforePrint); win.addEventListener('afterprint', afterPrint);
  paint();
  return () => {
    stopped = true; stopTheme(); win.cancelAnimationFrame(frame);
    win.removeEventListener('beforeprint', beforePrint); win.removeEventListener('afterprint', afterPrint);
    svg?.remove();
  };
}
