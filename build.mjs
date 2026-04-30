import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const extCtx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: ['vscode'],
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
});

const webCtx = await esbuild.context({
  entryPoints: ['src/webview/main.ts'],
  bundle: true,
  outfile: 'out/webview/bundle.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
});

if (watch) {
  await extCtx.watch();
  await webCtx.watch();
  console.log('Watching...');
} else {
  await extCtx.rebuild();
  await webCtx.rebuild();
  extCtx.dispose();
  webCtx.dispose();
  console.log('Build complete.');
}
