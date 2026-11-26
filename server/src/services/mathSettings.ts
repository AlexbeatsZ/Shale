import { z } from 'zod';
import { modify, applyEdits } from 'jsonc-parser';
import { normalizeMathConfiguration, defaultMathConfiguration, type MathConfiguration } from '@shale/markdown-core';
import { readVaultConfiguration, writeVaultConfiguration, parseConfiguration, type VaultConfigurationSource } from './vaultConfiguration.js';

export const MathConfigurationSchema = z.object({
  version: z.literal(1), packages: z.array(z.string().min(1).max(80)).max(64),
  packageOptions: z.record(z.record(z.unknown())), preambleFile: z.string().max(4096),
  preamble: z.string().max(262144),
}).strict();
/** Data-only defaults. Loading never writes the Vault. */
export async function readMathConfiguration() {
  const source = await readVaultConfiguration('math.jsonc');
  const value: MathConfiguration = source.exists
    ? normalizeMathConfiguration(MathConfigurationSchema.parse(parseConfiguration(source.content))) : defaultMathConfiguration();
  return { source, configuration: value };
}
export async function saveMathConfiguration(source: VaultConfigurationSource, input: unknown) {
  if (source.path !== 'math.jsonc') throw new Error('Invalid math configuration path');
  const configuration = normalizeMathConfiguration(MathConfigurationSchema.parse(input));
  let content = source.content || '{}';
  for (const [key, value] of Object.entries(configuration))
    content = applyEdits(content, modify(content, [key], value, { formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' } }));
  return { source: await writeVaultConfiguration({ ...source, content }), configuration };
}
