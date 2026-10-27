import { APP_BASE, TWITCH_CLIENT_ID } from '../config'
import type { StreamSpec } from '../types'

const TOKEN_KEY = 'twitch-access-token'
const PENDING_KEY = 'pending-streams'

export class AuthRequiredError extends Error {}

export interface VideoInfo {
  channel: string
  startDate: Date
  duration: number
}

export function captureTokenFromHash() {
  const match = window.location.hash.match(/access_token=([^&]+)/)
  if (!match) return
  localStorage.setItem(TOKEN_KEY, match[1])
  window.history.replaceState(null, '', window.location.pathname)
}

export interface PendingState {
  streams: StreamSpec[]
  startSeconds: number | null
}

export function savePendingStreams(streams: StreamSpec[], startSeconds: number | null) {
  const state: PendingState = { streams, startSeconds }
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(state))
}

export function takePendingStreams(): PendingState | null {
  const raw = sessionStorage.getItem(PENDING_KEY)
  sessionStorage.removeItem(PENDING_KEY)
  return raw ? (JSON.parse(raw) as PendingState) : null
}

export function redirectToLogin() {
  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: window.location.origin + APP_BASE,
    response_type: 'token',
    scope: '',
  })
  window.location.href = `https://id.twitch.tv/oauth2/authorize?${params}`
}

function parseDuration(text: string): number {
  const m = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!m) throw new Error('Ungueltige VOD-Dauer')
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

export async function fetchVideoInfo(vodId: string): Promise<VideoInfo> {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) throw new AuthRequiredError()

  const response = await fetch(
    `https://api.twitch.tv/helix/videos?id=${encodeURIComponent(vodId)}`,
    {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
      },
    },
  )
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    throw new AuthRequiredError()
  }
  if (!response.ok) {
    throw new Error(`Twitch API antwortet mit ${response.status}`)
  }

  const json = (await response.json()) as {
    data: { user_login: string; created_at: string; duration: string }[]
  }
  const video = json.data[0]
  if (!video) throw new Error('VOD nicht gefunden')

  return {
    channel: video.user_login,
    startDate: new Date(video.created_at),
    duration: parseDuration(video.duration),
  }
}
