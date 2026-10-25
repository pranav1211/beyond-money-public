import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // One build ID per build — used both inside the service worker (for
  // cache busting) and inside the app bundle (for runtime version
  // comparison against the live SW). Display version stays in
  // src/version.js; this is the silent change-detector.
  const buildId = Date.now().toString()
  const base = env.VITE_APP_BASE || '/'

  return {
    base,
    define: {
      __BM_BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [
      vue(),
      {
        name: 'sw-build-id',
        closeBundle() {
          // Post-build: inject the build timestamp AND the full list of hashed
          // app chunks into sw.js. The chunk list is what lets the service
          // worker pre-cache the WHOLE code-split app on install, so every
          // route works offline — not just the pages opened while online.
          const swPath = resolve('dist', 'sw.js')
          try {
            // Collect every emitted JS/CSS chunk under dist/assets, plus the
            // Latin font files (bundled Manrope/Sora) so text renders in the
            // real typeface offline from the first visit. Other scripts'
            // subsets (Cyrillic, Greek, …) load on demand.
            const assetsDir = resolve('dist', 'assets')
            const basePrefix = base.endsWith('/') ? base : `${base}/`
            let chunks = []
            try {
              chunks = readdirSync(assetsDir)
                .filter((f) => f.endsWith('.js') || f.endsWith('.css') || (f.endsWith('.woff2') && f.includes('-latin')))
                .map((f) => `${basePrefix}assets/${f}`)
            } catch (e) {
              // assets dir missing — leave chunks empty (SW falls back to [])
            }

            let sw = readFileSync(swPath, 'utf-8')
            sw = sw.replace('__BUILD_TIMESTAMP__', buildId)
            sw = sw.replace('__PRECACHE_CHUNKS__', JSON.stringify(chunks))
            writeFileSync(swPath, sw)
            console.log(`[sw-build-id] Injected ${chunks.length} chunks into sw.js`)
          } catch (e) {
            // sw.js may not exist in dev
          }
        }
      }
    ],
  }
})
