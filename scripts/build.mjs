import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'

mkdirSync('dist', { recursive: true })

await build({
  entryPoints: ['src/plugin/index.ts'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/plugin.js',
  target: 'es2022',
  platform: 'browser',
  // The Hermes desktop plugin loader resolves exactly these specifiers to the
  // app's own modules; everything else must be bundled into the file.
  external: ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'],
  legalComments: 'none',
  minify: true,
  sourcemap: false,
  logLevel: 'info'
})

console.log('built dist/plugin.js')
