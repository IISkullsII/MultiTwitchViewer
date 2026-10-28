import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command }) => ({
  base: process.env.GITHUB_ACTIONS ? '/MultiTwitchViewer/' : '/',
  plugins: [vue()],
  esbuild: command === 'build'
    ? { pure: ['console.log', 'console.info', 'console.debug'] }
    : {},
}))
