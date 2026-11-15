import { build, type Plugin, type Rollup } from 'vite';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

/** A separate bundle keeps application modules and globals out of note scripts. */
export function javascriptFramePlugin(): Plugin {
  const uiLicense = readFileSync(new URL('../../../LICENSE', import.meta.resolve('@openai/apps-sdk-ui/css')), 'utf8');
  let serving = false;
  let compiled: Promise<{ script: string; css: string }> | undefined;
  const compile = () => compiled ??= (async () => {
    const result = await build({
      configFile: false, root: fileURLToPath(new URL('../../../', import.meta.url)), publicDir: false,
      esbuild: { jsx: 'automatic', jsxDev: false },
      css: { postcss: { plugins: [tailwindcss(), {
        postcssPlugin: 'widget-system-fonts',
        // The controls use system fonts. Apps SDK UI's optional KaTeX font
        // faces reference a CDN, which this offline frame deliberately blocks.
        OnceExit(root) { root.walkAtRules('font-face', rule => { rule.remove(); }); },
      }] } },
      logLevel: 'warn',
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      build: {
        write: false, emptyOutDir: false, minify: true, cssMinify: true,
        target: 'es2022', cssCodeSplit: false,
        lib: { entry: fileURLToPath(new URL('./frame.ts', import.meta.url)), name: 'WebObsidianChart', formats: ['iife'] },
        rollupOptions: { output: { banner: `/*! @openai/apps-sdk-ui\n${uiLicense}\n*/` }, onwarn(warning, warn) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
          warn(warning);
        } },
      },
    }) as Rollup.RollupOutput[];
    const output = result.flatMap(bundle => bundle.output);
    return {
      script: output.filter(item => item.type === 'chunk').map(item => item.code).join('\n'),
      css: output.filter((item): item is Rollup.OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css'))
        .map(item => String(item.source)).join('\n'),
    };
  })().catch(error => { compiled = undefined; throw error; });
  return {
    name: 'webobsidian-javascript-frame',
    configResolved(config) { serving = config.command === 'serve'; },
    configureServer(server) {
      server.middlewares.use('/javascript-widget-runtime.js', (_request, response, next) => {
        void compile().then(({ script }) => {
          response.setHeader('Content-Type', 'application/javascript');
          response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          response.end(script);
        }).catch(next);
      });
    },
    resolveId(id) { if (id === 'virtual:javascript-frame') return '\0' + id; },
    async load(id) {
      if (id !== '\0virtual:javascript-frame') return;
      const { script, css } = await compile();
      if (!serving) this.emitFile({ type: 'asset', fileName: 'javascript-widget-runtime.js', source: script });
      return `export const css = ${JSON.stringify(css)}; export const scriptPath = '/javascript-widget-runtime.js';`;
    },
  };
}
