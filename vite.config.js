import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    base: env.VITE_APP_BASE || '/',
    plugins: [
      vue(),
      {
        name: 'sw-build-id',
        closeBundle() {
          // Inject build timestamp into sw.js after build
          const swPath = resolve('dist', 'sw.js')
          try {
            let sw = readFileSync(swPath, 'utf-8')
            sw = sw.replace('__BUILD_TIMESTAMP__', Date.now().toString())
            writeFileSync(swPath, sw)
          } catch (e) {
            // sw.js may not exist in dev
          }
        }
      }
    ],
  }
})
