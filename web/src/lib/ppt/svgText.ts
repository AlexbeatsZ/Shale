import type { PageText } from '../pdf/text';

const namespace = 'http://www.w3.org/2000/svg';
const textAttributes = new Set([
  'x', 'y', 'dx', 'dy', 'transform', 'font-family', 'font-size', 'font-weight', 'font-style',
  'font-stretch', 'letter-spacing', 'word-spacing', 'text-anchor', 'dominant-baseline',
  'direction', 'unicode-bidi', 'writing-mode', 'textLength', 'lengthAdjust', 'startOffset',
]);

/** Rebuild only inert text and coordinate attributes from the renderer's SVG. */
export function slideTextSvg(markup: string, width: number, height: number): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  if (parsed.querySelector('parsererror')) throw new Error('幻灯片 SVG 无法解析');
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
  svg.setAttribute('font-family', parsed.documentElement.getAttribute('font-family') ?? 'sans-serif');
  const copy = (source: Element): SVGElement | null => {
    if (source.localName === 'defs') return null;
    const isText = ['text', 'tspan', 'textPath'].includes(source.localName);
    const target = document.createElementNS(namespace, isText ? source.localName : 'g');
    for (const attribute of source.attributes) {
      if (textAttributes.has(attribute.name)) target.setAttribute(attribute.name, attribute.value);
      if (source.localName === 'textPath' && attribute.localName === 'href' && attribute.value.startsWith('#'))
        target.setAttribute('href', attribute.value);
    }
    for (const child of source.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && isText) target.append(document.createTextNode(child.textContent ?? ''));
      if (child.nodeType === Node.ELEMENT_NODE) {
        const copied = copy(child as Element);
        if (copied) target.append(copied);
      }
    }
    return target.childNodes.length ? target : null;
  };
  const defs = document.createElementNS(namespace, 'defs');
  for (const path of parsed.querySelectorAll('defs path[id]')) {
    const target = document.createElementNS(namespace, 'path');
    target.setAttribute('id', path.id); target.setAttribute('d', path.getAttribute('d') ?? '');
    defs.append(target);
  }
  svg.append(defs);
  for (const child of parsed.documentElement.children) {
    const copied = copy(child);
    if (copied) svg.append(copied);
  }
  return svg;
}

export function measureSlideText(svg: SVGSVGElement, width: number, height: number): PageText {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;contain:layout style paint;pointer-events:none';
  host.append(svg); document.body.append(host);
  const model: PageText = { text: '', runs: [], width, height };
  try {
    for (const element of svg.querySelectorAll('text')) {
      const value = element.textContent ?? '';
      if (!value) continue;
      const from = model.text.length;
      model.text += value;
      const box = element.getBBox(), matrix = element.getCTM();
      if (matrix) {
        const points = [new DOMPoint(box.x, box.y), new DOMPoint(box.x + box.width, box.y),
          new DOMPoint(box.x, box.y + box.height), new DOMPoint(box.x + box.width, box.y + box.height)]
          .map(point => point.matrixTransform(matrix));
        const left = Math.min(...points.map(point => point.x)), top = Math.min(...points.map(point => point.y));
        model.runs.push({ from, to: model.text.length, axis: Math.abs(matrix.b) > Math.abs(matrix.a) ? 'y' : 'x',
          reverse: element.getAttribute('direction') === 'rtl', box: { x: left / width, y: top / height,
            width: (Math.max(...points.map(point => point.x)) - left) / width,
            height: (Math.max(...points.map(point => point.y)) - top) / height } });
      }
      model.text += '\n';
    }
    return model;
  } finally { host.remove(); }
}
