import type { TwitchPlayer } from './useTwitchEmbed'
import type { Operation } from '../services/popoutBridge'

export class RemotePlayer implements TwitchPlayer {
  private currentTime = 0
  private volume = 0.74

  constructor(private readonly send: (op: Operation, value?: number) => void) {}

  setCurrentTime(seconds: number) {
    this.currentTime = seconds
  }

  play() {
    this.send('play')
  }

  pause() {
    this.send('pause')
  }

  seek(seconds: number) {
    this.send('seek', seconds)
  }

  getCurrentTime(): number {
    return this.currentTime
  }

  getDuration(): number {
    return 0
  }

  getVolume(): number {
    return this.volume
  }

  setVolume(volume: number) {
    this.volume = volume
    this.send('volume', volume)
  }

  getMuted(): boolean {
    return false
  }

  setMuted() {}

  getStatus(): string {
    return ''
  }

  getPlaybackStats() {
    return {}
  }

  addEventListener() {}

  removeEventListener() {}

  destroy() {}
}
