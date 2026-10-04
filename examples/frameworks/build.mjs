// Bundles the React and Vue example apps the way a real project's bundler would
// (esbuild here; Vite, webpack, Next.js and Nuxt treat the package the same way).
//   node examples/frameworks/build.mjs      then open /frameworks/react or /frameworks/vue in the demo
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: { react: join(here, 'react-app.js'), vue: join(here, 'vue-app.js') },
  outdir: join(here, 'dist'),
  bundle: true,
  splitting: true, // the chat's own code is loaded on demand, in the browser only
  format: 'esm',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'false', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  logLevel: 'warning',
});
console.log('built examples/frameworks/dist');
