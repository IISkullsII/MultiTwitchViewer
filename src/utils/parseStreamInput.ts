import type { PlayerMode } from '../types'

export interface ParsedStreamInput {
  channel: string
  mode: PlayerMode
  vodId: string
}

const CHANNEL_NAME_PATTERN = /^[A-Za-z0-9_]{1,25}$/

const RESERVED_PATHS = [
  'videos', 'directory', 'clip', 'downloads', 'settings', 'search', 'store',
  'jobs', 'friends', 'subscriptions', 'wallet', 'moderator', 'team', 'p', 'user',
]

function isChannelName(name: string): boolean {
  return CHANNEL_NAME_PATTERN.test(name) && !RESERVED_PATHS.includes(name.toLowerCase())
}

export function parseStreamInput(raw: string): ParsedStreamInput | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const vodMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/videos\/(\d+)/i)
  if (vodMatch) {
    return { channel: '', mode: 'vod', vodId: vodMatch[1] }
  }

  const urlMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([^\/?#\s]+)/i)
  if (urlMatch) {
    return isChannelName(urlMatch[1])
      ? { channel: urlMatch[1], mode: 'live', vodId: '' }
      : null
  }

  if (/twitch\.tv\//i.test(trimmed)) return null

  return isChannelName(trimmed)
    ? { channel: trimmed, mode: 'live', vodId: '' }
    : null
}
