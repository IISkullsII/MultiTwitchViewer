import { ref, computed, reactive, onMounted, onBeforeUnmount } from 'vue'
import type { StreamEntry, VodEntry } from '../types'
import type { TwitchPlayer } from './useTwitchEmbed'

const TICK_MS = 250
const RESYNC_THRESHOLD = 0.5
const LAND_TOLERANCE = 1
const SEEK_SETTLE_MS = 20000

export function usePlayback(
  getEntries: () => StreamEntry[],
  getPlayer: (id: string) => TwitchPlayer | undefined,
) {
  const playingIds = reactive(new Set<string>())
  const playing = computed(() => playingIds.size > 0)
  const basePosition = ref<number | null>(null)
  const position = ref(0)
  const pendingSeeks = new Map<string, { target: number; at: number }>()
  let wallStart = 0

  const vods = computed(() =>
    getEntries().filter(
      (e): e is VodEntry => e.mode === 'vod' && e.vodStart !== undefined && e.duration !== undefined,
    ),
  )

  const range = computed(() => {
    if (vods.value.length === 0) return null
    return {
      start: Math.min(...vods.value.map((v) => v.vodStart)),
      end: Math.max(...vods.value.map((v) => v.vodStart + v.duration * 1000)),
    }
  })

  const bars = computed(() =>
    vods.value.map((v) => ({
      id: v.id,
      start: v.vodStart,
      end: v.vodStart + v.duration * 1000,
    })),
  )

  function clampPosition(pos: number): number {
    const r = range.value
    if (!r) return pos
    return Math.min(Math.max(pos, r.start), r.end)
  }

  function currentPosition(): number {
    if (playing.value && basePosition.value !== null) {
      return basePosition.value + (Date.now() - wallStart)
    }
    return basePosition.value ?? range.value?.start ?? 0
  }

  function anchorAt(pos: number) {
    basePosition.value = pos
    wallStart = Date.now()
    position.value = pos
  }

  function seekSeconds(v: VodEntry, pos: number): number {
    return (pos - v.vodStart) / 1000 + v.delay
  }

  function clampSeconds(v: VodEntry, t: number): number {
    return Math.min(Math.max(t, 0), v.duration)
  }

  function seekOne(v: VodEntry, player: TwitchPlayer, t: number) {
    const target = clampSeconds(v, t)
    player.seek(target)
    pendingSeeks.set(v.id, { target, at: Date.now() })
  }

  function seekAll(pos: number, exceptId?: string) {
    for (const v of vods.value) {
      if (v.id === exceptId) continue
      const player = getPlayer(v.id)
      if (!player) continue
      const t = seekSeconds(v, pos)
      const inRange = t >= 0 && t < v.duration
      if (!inRange && playingIds.has(v.id)) {
        playingIds.delete(v.id)
        player.pause()
      }
      seekOne(v, player, t)
    }
  }

  // True while a VOD is still on its way to a seek target. Its events then reflect
  // the position before the seek and must not change the timeline.
  function isSettling(id: string, currentTime: number): boolean {
    const pending = pendingSeeks.get(id)
    if (!pending) return false
    if (Math.abs(currentTime - pending.target) <= LAND_TOLERANCE) {
      pendingSeeks.delete(id)
      return false
    }
    if (Date.now() - pending.at > SEEK_SETTLE_MS) {
      pendingSeeks.delete(id)
      return false
    }
    return true
  }

  function onPlayerPlaying(id: string) {
    const v = vods.value.find((x) => x.id === id)
    const player = getPlayer(id)
    if (!v || !player) return
    const ct = player.getCurrentTime()

    if (isSettling(id, ct)) {
      if (!playing.value) anchorAt(currentPosition())
      playingIds.add(id)
      return
    }

    if (!playing.value) {
      const pos = clampPosition(v.vodStart + (ct - v.delay) * 1000)
      playingIds.add(id)
      anchorAt(pos)
      seekAll(pos, id)
      return
    }

    const target = clampSeconds(v, seekSeconds(v, currentPosition()))
    if (Math.abs(ct - target) > RESYNC_THRESHOLD) {
      seekOne(v, player, target)
    }
    playingIds.add(id)
  }

  function onPlayerPaused(id: string) {
    const player = getPlayer(id)
    if (!player) return
    const ct = player.getCurrentTime()
    if (isSettling(id, ct)) return
    if (!playingIds.has(id)) return
    const pos = currentPosition()
    playingIds.delete(id)
    if (!playing.value) anchorAt(pos)
  }

  function forget(id: string) {
    pendingSeeks.delete(id)
    if (!playingIds.has(id)) return
    const pos = currentPosition()
    playingIds.delete(id)
    if (!playing.value) anchorAt(pos)
  }

  function resync(id: string) {
    const v = vods.value.find((x) => x.id === id)
    const player = getPlayer(id)
    if (!v || !player || playingIds.has(id)) return
    seekOne(v, player, seekSeconds(v, currentPosition()))
  }

  function pause() {
    const pos = currentPosition()
    playingIds.clear()
    for (const v of vods.value) {
      getPlayer(v.id)?.pause()
    }
    anchorAt(pos)
  }

  function seek(pos: number) {
    if (!range.value) return
    const target = clampPosition(pos)
    anchorAt(target)
    seekAll(target)
  }

  function sync() {
    seekAll(currentPosition())
  }

  function skip(seconds: number) {
    seek(currentPosition() + seconds * 1000)
  }

  function tick() {
    const r = range.value
    if (!r) return
    position.value = currentPosition()
    if (playing.value && position.value >= r.end) pause()
  }

  let timer: number | undefined

  onMounted(() => {
    timer = window.setInterval(tick, TICK_MS)
  })

  onBeforeUnmount(() => {
    clearInterval(timer)
  })

  return {
    position,
    playing,
    range,
    bars,
    pause,
    seek,
    skip,
    sync,
    resync,
    forget,
    onPlayerPlaying,
    onPlayerPaused,
  }
}
