import { ref, watch } from 'vue'
import type { StreamEntry, SyncState } from '../types'
import type { TwitchPlayer } from './useTwitchEmbed'

export function useSync(
  entries: StreamEntry[],
  getPlayer: (id: string) => TwitchPlayer | undefined,
) {
  const syncState = ref<SyncState>({
    masterId: null,
    lastMasterTime: 0,
  })

  const offsets = ref<Map<string, number>>(new Map())

  function getMasterEntry(): StreamEntry | undefined {
    return entries.find((e) => e.isMaster)
  }

  function setMaster(entryId: string) {
    entries.forEach((e) => {
      e.isMaster = e.id === entryId
    })
    syncState.value.masterId = entryId
  }

  function getMasterTime(): number {
    const master = getMasterEntry()
    if (!master) return 0
    const player = getPlayer(master.id)
    if (!player) return 0
    return player.getCurrentTime()
  }

  function recordOffset(slaveId: string) {
    const master = getMasterEntry()
    if (!master) return

    const masterPlayer = getPlayer(master.id)
    const slavePlayer = getPlayer(slaveId)
    if (!masterPlayer || !slavePlayer) return

    const masterTime = masterPlayer.getCurrentTime()
    const slaveTime = slavePlayer.getCurrentTime()
    const offset = slaveTime - masterTime

    offsets.value.set(slaveId, offset)

    const entry = entries.find((e) => e.id === slaveId)
    if (entry) {
      entry.offset = offset
    }
  }

  function seekSlaveToMaster(slaveId: string) {
    const master = getMasterEntry()
    if (!master) return

    const masterPlayer = getPlayer(master.id)
    const slavePlayer = getPlayer(slaveId)
    if (!masterPlayer || !slavePlayer) return

    const masterTime = masterPlayer.getCurrentTime()
    const offset = offsets.value.get(slaveId) ?? 0
    const targetTime = masterTime + offset
    const slaveDuration = slavePlayer.getDuration()

    if (slaveDuration > 0) {
      const clampedTime = Math.max(0, Math.min(targetTime, slaveDuration))
      slavePlayer.seek(clampedTime)
    }
  }

  function syncAll() {
    const master = getMasterEntry()
    if (!master) return

    const masterPlayer = getPlayer(master.id)
    if (!masterPlayer) return

    syncState.value.lastMasterTime = masterPlayer.getCurrentTime()

    for (const entry of entries) {
      if (entry.isMaster || entry.mode === 'live') continue
      seekSlaveToMaster(entry.id)
    }
  }

  function recordAllOffsets() {
    const master = getMasterEntry()
    if (!master) return

    for (const entry of entries) {
      if (entry.isMaster || entry.mode === 'live') continue
      recordOffset(entry.id)
    }
  }

  function syncOnce() {
    syncAll()
  }

  watch(
    () => entries.filter((e) => e.isMaster).length,
    (count) => {
      if (count === 0) {
        syncState.value.masterId = null
      }
    },
  )

  return {
    syncState,
    offsets,
    setMaster,
    syncOnce,
    recordAllOffsets,
    getMasterTime,
  }
}
