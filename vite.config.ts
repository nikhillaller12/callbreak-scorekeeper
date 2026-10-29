import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** After the build, writes dist/sw.js with the exact list of built files to precache (offline support). */
function serviceWorkerPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'callbreak-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
        .sort();
      const hash = createHash('sha1');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const template = readFileSync('scripts/sw.template.js', 'utf8');
      const sw = template
        .replaceAll('__PRECACHE__', JSON.stringify(files))
        .replaceAll('__VERSION__', hash.digest('hex').slice(0, 10));
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

// base './' lets the same build work on any host or sub-path (GitHub Pages project sites, Netlify, Cloudflare...).
export default defineConfig({
  base: './',
  plugins: [react(), serviceWorkerPlugin()],
  build: { target: 'es2020', sourcemap: false },
});
