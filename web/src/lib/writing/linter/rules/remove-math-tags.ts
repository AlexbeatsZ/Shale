import { removeMathTags } from '@shale/markdown-core';
import { RuleType, type Options } from '../rules';
import RuleBuilder, { type ExampleBuilder, type OptionBuilderBase } from './rule-builder';

class RemoveMathTagsOptions implements Options {}

@RuleBuilder.register
export default class RemoveMathTags extends RuleBuilder<RemoveMathTagsOptions> {
  constructor() {
    super({ nameKey: 'rules.remove-math-tags.name', descriptionKey: 'rules.remove-math-tags.description', type: RuleType.CONTENT });
  }
  get OptionsClass() { return RemoveMathTagsOptions; }
  apply(text: string) { return removeMathTags(text); }
  get exampleBuilders(): ExampleBuilder<RemoveMathTagsOptions>[] { return []; }
  get optionBuilders(): OptionBuilderBase<RemoveMathTagsOptions>[] { return []; }
}

@RuleBuilder.register
export class RemoveMathTagsOnPaste extends RuleBuilder<RemoveMathTagsOptions> {
  constructor() {
    super({ nameKey: 'rules.remove-math-tags-on-paste.name', descriptionKey: 'rules.remove-math-tags-on-paste.description', type: RuleType.PASTE });
  }
  get OptionsClass() { return RemoveMathTagsOptions; }
  apply(text: string) { return removeMathTags(text); }
  get exampleBuilders(): ExampleBuilder<RemoveMathTagsOptions>[] { return []; }
  get optionBuilders(): OptionBuilderBase<RemoveMathTagsOptions>[] { return []; }
}
