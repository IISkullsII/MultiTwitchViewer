import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

const VIRTUAL_ID = 'virtual:app-version'
const RESOLVED_ID = '\0' + VIRTUAL_ID

function currentCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

function appVersionPlugin(): Plugin {
  const packageJsonPath = resolve(process.cwd(), 'package.json')
  return {
    name: 'app-version',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id !== RESOLVED_ID) return
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version: string }
      return [
        `export const version = ${JSON.stringify(pkg.version)}`,
        `export const commit = ${JSON.stringify(currentCommit())}`,
        `export const build = ${JSON.stringify(new Date().toISOString())}`,
      ].join('\n')
    },
    configureServer(server) {
      server.watcher.add(packageJsonPath)
      server.watcher.on('change', (file) => {
        if (resolve(file) !== packageJsonPath) return
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      })
    },
  }
}

export default defineConfig(({ command }) => ({
  base: process.env.GITHUB_ACTIONS ? '/MultiTwitchViewer/' : '/',
  plugins: [vue(), appVersionPlugin()],
  esbuild: command === 'build'
    ? { pure: ['console.log', 'console.info', 'console.debug'] }
    : {},
}))
