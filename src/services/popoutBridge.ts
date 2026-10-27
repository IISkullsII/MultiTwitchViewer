import type { PlayerMode, StreamEntry } from '../types'

export interface DirectoryItem {
  id: string
  label: string
  mode: PlayerMode
  owner: string | null
  color?: string
}

export type Operation = 'play' | 'pause' | 'seek' | 'volume'
export type TileEventName = 'playing' | 'pause' | 'ready'

export type BridgeMessage =
  | { type: 'heartbeat' }
  | { type: 'main-closed' }
  | { type: 'hello'; from: string }
  | { type: 'alive'; from: string }
  | { type: 'settings'; lightTheme: boolean; keepChatsLoaded: boolean }
  | { type: 'audio'; id: string | null }
  | { type: 'directory'; items: DirectoryItem[] }
  | { type: 'take'; from: string; ids: string[] }
  | { type: 'adopt'; to: string; entries: StreamEntry[] }
  | { type: 'patch'; to: string; id: string; delay: number }
  | { type: 'drop'; to: string; id: string }
  | { type: 'return'; from: string; ids: string[] }
  | { type: 'command'; to: string; id: string; op: Operation; value?: number }
  | { type: 'state'; from: string; items: { id: string; currentTime: number }[] }
  | { type: 'event'; from: string; id: string; name: TileEventName; currentTime: number }
  | { type: 'set-audio'; from: string; id: string }
  | { type: 'set-delay'; from: string; id: string; seconds: number }
  | { type: 'play-all'; from: string }
  | { type: 'pause-all'; from: string }
  | { type: 'sync'; from: string }
  | { type: 'hover'; id: string | null }

const channel = new BroadcastChannel('multitwitch-viewer')

export function sendBridge(message: BridgeMessage) {
  channel.postMessage(message)
}

export function onBridge(handler: (message: BridgeMessage) => void): () => void {
  const listener = (event: MessageEvent<BridgeMessage>) => handler(event.data)
  channel.addEventListener('message', listener)
  return () => channel.removeEventListener('message', listener)
}
