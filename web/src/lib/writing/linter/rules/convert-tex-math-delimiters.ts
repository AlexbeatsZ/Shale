// @ts-nocheck -- native rule written in the upstream rule-builder shape.
import {Options, RuleType} from '../rules';
import RuleBuilder, {ExampleBuilder, OptionBuilderBase} from './rule-builder';
import dedent from 'ts-dedent';
import {analyzeMarkdown, mathRegions} from '@webobsidian/markdown-core';

class ConvertTexMathDelimitersOptions implements Options {}

/**
 * `\( … \)` → `$…$` and `\[ … \]` → `$$ … $$`. Regions come from the shared
 * formula model, preserving code, link destinations and escaped bracket
 * citations in prose. Conversion is opt-in.
 */
export function convertTexMathDelimiters(text: string): string {
  const regions = mathRegions(analyzeMarkdown(text)).filter((region) => region.delimiter && region.tex.trim());
  let out = '', last = 0;
  for (const region of regions) {
    const display = region.delimiter === 'bracket';
    let body = text.slice(region.bodyFrom, region.bodyTo);
    if (!display) {
      // `$ x$` / `$x $` would not parse as inline math; a closer before a digit neither.
      body = body.trim();
      if (!body || /\d/.test(text[region.to] ?? '')) continue;
    }
    const mark = display ? '$$' : '$';
    out += text.slice(last, region.openFrom) + mark + body + mark;
    last = region.to;
  }
  return out + text.slice(last);
}
@RuleBuilder.register
export default class ConvertTexMathDelimiters extends RuleBuilder<ConvertTexMathDelimitersOptions> {
  constructor() {
    super({
      nameKey: 'rules.convert-tex-math-delimiters.name',
      descriptionKey: 'rules.convert-tex-math-delimiters.description',
      type: RuleType.CONTENT,
      hasSpecialExecutionOrder: true,
    });
  }
  get OptionsClass(): new () => ConvertTexMathDelimitersOptions {
    return ConvertTexMathDelimitersOptions;
  }
  apply(text: string): string {
    return convertTexMathDelimiters(text);
  }
  get exampleBuilders(): ExampleBuilder<ConvertTexMathDelimitersOptions>[] {
    return [
      new ExampleBuilder({
        description: 'Inline and display TeX delimiters become dollar math',
        before: dedent`
          设 \\( \\alpha > 0 \\),则
          \\[
          E = mc^2
          \\]
        `,
        after: dedent`
          设 $\\alpha > 0$,则
          $$
          E = mc^2
          $$
        `,
      }),
    ];
  }
  get optionBuilders(): OptionBuilderBase<ConvertTexMathDelimitersOptions>[] {
    return [];
  }
}
