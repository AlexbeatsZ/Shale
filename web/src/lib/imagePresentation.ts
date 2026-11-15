import { imageCaption, imageName, parseImageParameters, type ImageEmbed, type MarkdownModel, type SourceSpan } from '@webobsidian/markdown-core';
import { bindDarkMedia } from './mediaFilter';

interface MarkdownImage extends SourceSpan { alt: string; altTo: number; target: string }
const markdownImages = new WeakMap<MarkdownModel, Map<number, MarkdownImage>>();

/** The existing grammar owns balanced destinations, including SVG data payloads. */
export function markdownImageAt(model: MarkdownModel, from: number): MarkdownImage | undefined {
  let images = markdownImages.get(model);
  if (!images) {
    images = new Map();
    for (const range of model.nodes) {
      if (range.name !== 'Image') continue;
      let image = model.tree.resolveInner(range.from, 1);
      while (image.name !== 'Image' && image.parent) image = image.parent;
      if (image.name !== 'Image' || image.from !== range.from) continue;
      const destination = image.getChild('URL'), closingAlt = image.getChildren('LinkMark')[1];
      if (!destination || !closingAlt) continue;
      images.set(range.from, { from: range.from, to: range.to,
        alt: model.text.slice(range.from + 2, closingAlt.from),
        altTo: closingAlt.from,
        target: model.text.slice(destination.from, destination.to).replace(/^<|>$/g, ''),
      });
    }
    markdownImages.set(model, images);
  }
  return images.get(from);
}

/** Presentation metadata is kept separate from the resolved/request URL. */
export function imagePresentation(target: string, alt: string) {
  const parameters = parseImageParameters(target, alt);
  const path = parameters.target.split(/[?#]/)[0];
  return {
    ...parameters, alt,
    caption: parameters.alias?.trim() || imageName(parameters.target),
    svg: /\.svg$/i.test(path) || /^data:image\/svg\+xml(?:[;,])/i.test(target),
    center: parameters.align === 'center',
  };
}

export function applyImagePresentation(wrap: HTMLElement, target: string, alt: string, instance?: ImageEmbed): void {
  const image = imagePresentation(target, alt);
  const parameters = instance?.parameters ?? image;
  wrap.classList.add('cm-image-wrap');
  wrap.dataset.imageSource = target;
  wrap.dataset.imageCaption = instance ? imageCaption(instance) : image.caption;
  if (instance) wrap.dataset.imageNumber = instance.number;
  wrap.toggleAttribute('data-image-svg', image.svg);
  wrap.toggleAttribute('data-image-center', parameters.align === 'center');
  wrap.toggleAttribute('data-image-full', parameters.full);
  wrap.toggleAttribute('data-image-dark', parameters.dark);
  wrap.dataset.imageAlign = parameters.align;
  wrap.style.setProperty('--image-scale', String(parameters.scale));
  wrap.style.setProperty('--image-fit', parameters.fit);
  for (const [name, value] of Object.entries(parameters.attributes))
    if (/^[a-z][a-z0-9-]*$/.test(name) && value === true) wrap.classList.add('embed-property-' + name);
  const caption = wrap.ownerDocument.createElement('span');
  caption.className = 'cm-image-caption'; caption.textContent = wrap.dataset.imageCaption;
  wrap.append(caption);
}

/** HTML images receive the same presentation as Markdown images after sanitizing. */
export function presentHtmlImages(host: HTMLElement, targets: string[], onLoad: () => void, signal: AbortSignal): void {
  host.querySelectorAll('img').forEach((img, index) => {
    const wrap = img.ownerDocument.createElement('span');
    applyImagePresentation(wrap, targets[index] ?? img.getAttribute('src') ?? '', img.alt);
    img.classList.add('cm-embed-image');
    img.replaceWith(wrap); wrap.prepend(img);
    const stop = bindDarkMedia(wrap, () => wrap.hasAttribute('data-image-dark'));
    signal.addEventListener('abort', stop, { once: true });
    img.addEventListener('load', onLoad, { once: true, signal });
    img.addEventListener('error', onLoad, { once: true, signal });
  });
  for (const wrap of host.querySelectorAll('.cm-image-wrap')) {
    const row = wrap.parentElement!;
    if ([...row.childNodes].every(node => node.nodeType === 3 ? !node.textContent?.trim() : node instanceof Element && node.classList.contains('cm-image-wrap'))) {
      row.classList.add('cm-image-row');
    }
  }
}
