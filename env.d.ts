/// <reference types="vite/client" />

declare module 'virtual:app-version' {
  export const version: string
  export const commit: string
  export const build: string
}
