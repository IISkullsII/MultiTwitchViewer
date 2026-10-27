export type PlayerMode = 'live' | 'vod'

export interface StreamSpec {
  channel: string
  mode: PlayerMode
  vodId: string
  delay: number
}

export interface StreamEntry {
  id: string
  channel: string
  mode: PlayerMode
  vodId?: string
  label: string
  delay: number
  vodStart?: number
  duration?: number
  windowId?: string
  color?: string
}

export type VodEntry = StreamEntry & { vodStart: number; duration: number }
