import { ref, onBeforeUnmount } from 'vue'
import type { StreamEntry } from '../types'

declare global {
  interface Window {
    Twitch?: {
      Player: new (id: string, options: Record<string, unknown>) => TwitchPlayer
    }
  }
}

export interface TwitchPlayer {
  play(): void
  pause(): void
  seek(seconds: number): void
  getCurrentTime(): number
  getDuration(): number
  getVolume(): number
  setVolume(volume: number): void
  getMuted(): boolean
  setMuted(muted: boolean): void
  getStatus(): string
  addEventListener(event: string, callback: () => void): void
  removeEventListener(event: string, callback: () => void): void
  destroy(): void
}

export function useTwitchEmbed() {
  const playerInstances = new Map<string, TwitchPlayer>()
  const iframeReady = ref(false)
  const activeAudioId = ref<string | null>(null)
  const activeVolume = ref(0.74)

  function setInitialVolume(id: string, isMaster: boolean) {
    const player = playerInstances.get(id)
    if (!player) return
    if (isMaster) {
      player.setVolume(activeVolume.value)
      activeAudioId.value = id
    } else {
      player.setVolume(0.01)
    }
  }

  function setActiveAudio(id: string) {
    const prevId = activeAudioId.value
    if (prevId && prevId !== id) {
      const prevPlayer = playerInstances.get(prevId)
      if (prevPlayer) {
        activeVolume.value = prevPlayer.getVolume()
      }
    }

    for (const [pid, player] of playerInstances) {
      if (pid === id) {
        player.setVolume(activeVolume.value)
      } else {
        player.setVolume(0.01)
      }
    }
    activeAudioId.value = id
  }

  function loadTwitchIframe(): Promise<void> {
    return new Promise((resolve) => {
      if (document.getElementById('twitch-embed-script')) {
        resolve()
        return
      }
      const script = document.createElement('script')
      script.id = 'twitch-embed-script'
      script.src = 'https://embed.twitch.tv/embed/v1.js'
      script.onload = () => {
        iframeReady.value = true
        resolve()
      }
      document.head.appendChild(script)
    })
  }

  function createPlayer(containerId: string, entry: StreamEntry): TwitchPlayer | null {
    if (!window.Twitch) return null

    const hostname = window.location.hostname || 'localhost'
    const parentParam = hostname === 'localhost'
      ? ['localhost']
      : [hostname]

    const options: Record<string, unknown> = {
      parent: parentParam,
      autoplay: false,
      muted: false,
      allowfullscreen: true,
    }

    if (entry.mode === 'live') {
      options.channel = entry.channel
      options.layout = 'video-with-chat'
    } else if (entry.vodId) {
      options.video = entry.vodId
    }

    const container = document.getElementById(containerId)
    if (!container) return null
    container.innerHTML = ''

    const player = new window.Twitch.Player(containerId, options)
    playerInstances.set(entry.id, player)
    return player
  }

  function getPlayer(id: string): TwitchPlayer | undefined {
    return playerInstances.get(id)
  }

  function destroyPlayer(id: string) {
    const player = playerInstances.get(id)
    if (player) {
      player.destroy()
      playerInstances.delete(id)
    }
  }

  function destroyAll() {
    for (const [id] of playerInstances) {
      destroyPlayer(id)
    }
  }

  onBeforeUnmount(() => {
    destroyAll()
  })

  function playAll() {
    const ids = [...playerInstances.keys()]
    ids.forEach((id) => {
      const player = playerInstances.get(id);
      player?.play();
    })
  }

  function pauseAll() {
    for (const player of playerInstances.values()) {
      player.pause()
    }
  }

  function getAllPlayers(): TwitchPlayer[] {
    return [...playerInstances.values()]
  }

  return {
    iframeReady,
    loadTwitchIframe,
    createPlayer,
    getPlayer,
    destroyPlayer,
    destroyAll,
    playAll,
    pauseAll,
    getAllPlayers,
    activeAudioId,
    activeVolume,
    setInitialVolume,
    setActiveAudio,
  }
}
