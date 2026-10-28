import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

function currentCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig(({ command }) => ({
  base: process.env.GITHUB_ACTIONS ? '/MultiTwitchViewer/' : '/',
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(currentCommit()),
    __APP_BUILD__: JSON.stringify(new Date().toISOString()),
  },
  esbuild: command === 'build'
    ? { pure: ['console.log', 'console.info', 'console.debug'] }
    : {},
}))
