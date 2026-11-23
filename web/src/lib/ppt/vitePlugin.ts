import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

export function presentationLicenses(): Plugin {
  const require = createRequire(import.meta.url);
  return {
    name: 'shale-presentation-licenses',
    generateBundle() {
      for (const [name, filename] of [['@web-ppt/core', 'LICENSE'], ['fflate', 'LICENSE']] as const) {
        const root = dirname(require.resolve(name + '/package.json'));
        this.emitFile({ type: 'asset', fileName: `licenses/${name.replace(/[@/]/g, '')}.txt`, source: readFileSync(join(root, filename)) });
      }
    },
  };
}
