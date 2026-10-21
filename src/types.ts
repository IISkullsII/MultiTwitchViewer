export type PlayerMode = 'live' | 'vod'

export interface StreamEntry {
  id: string
  channel: string
  mode: PlayerMode
  vodId?: string
  offset: number
  isMaster: boolean
  label: string
}

export interface SyncState {
  masterId: string | null
  lastMasterTime: number
}
