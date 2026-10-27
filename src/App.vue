<script setup lang="ts">
import { ref, computed, watch, watchEffect, onMounted, onBeforeUnmount } from 'vue'
import type { StreamEntry, StreamSpec, PlayerMode } from './types'
import { useTwitchEmbed } from './composables/useTwitchEmbed'
import { usePlayback } from './composables/usePlayback'
import { RemotePlayer } from './composables/remotePlayer'
import { parseStreamInput } from './utils/parseStreamInput'
import { formatTimeParam, parseTimeParam } from './utils/timeParam'
import { VOD_COLORS } from './utils/colors'
import {
  onBridge,
  sendBridge,
  type BridgeMessage,
  type DirectoryItem,
  type Operation,
} from './services/popoutBridge'
import {
  AuthRequiredError,
  captureTokenFromHash,
  fetchVideoInfo,
  redirectToLogin,
  savePendingStreams,
  takePendingStreams,
  type VideoInfo,
} from './services/twitchApi'
import TwitchPlayerCard from './components/TwitchPlayerCard.vue'
import AddStreamForm from './components/AddStreamForm.vue'
import PlayerControls from './components/PlayerControls.vue'
import SettingsSection from './components/SettingsSection.vue'
import ChatPanel from './components/ChatPanel.vue'
import Timeline from './components/Timeline.vue'
import PopoutSelection from './components/PopoutSelection.vue'

const popoutId = new URLSearchParams(window.location.search).get('popout')
const isPopout = popoutId !== null
const myWindowId = popoutId ?? 'main'
const HEARTBEAT_TIMEOUT_MS = 4000

const entries = ref<StreamEntry[]>([])
const addError = ref<string | null>(null)
const directory = ref<DirectoryItem[]>([])
const audioId = ref<string | null>(null)
const remotePlayers = new Map<string, RemotePlayer>()
const popoutSeen = new Map<string, number>()
let lastHeartbeat = Date.now()

const {
  loadTwitchIframe, createPlayer, getPlayer, destroyPlayer,
  playAll, pauseAll,
  activeVolume, setInitialVolume, setActiveAudio: setEmbedAudio, getLatency,
} = useTwitchEmbed({
  onPlaying: (id) => onTileEvent(id, 'playing'),
  onPaused: (id) => onTileEvent(id, 'pause'),
})

const playback = usePlayback(
  () => entries.value,
  (id) => remotePlayers.get(id) ?? getPlayer(id),
)
const {
  position, range, bars, pause, seek, skip,
  sync: syncPlayback, resync, forget,
} = playback

const twitchReady = ref(false)
const loadError = ref(false)
const panelOpen = ref(true)
const viewMode = ref<'tiled' | 'focused'>('tiled')
const lightTheme = ref(false)

watchEffect(() => {
  document.documentElement.dataset.theme = lightTheme.value ? 'light' : 'dark'
})

const showLatency = ref(true)
const keepChatsLoaded = ref(true)
const chatOpen = ref(true)
const chatWidth = ref(340)
const chatChannel = ref<string | null>(null)
let chatResizing = false
const focusedId = ref<string | null>(null)

const localEntries = computed(() =>
  isPopout ? entries.value : entries.value.filter((e) => !e.windowId),
)

const sidebarEntries = computed(() =>
  entries.value.map((e) =>
    isPopout || !e.windowId ? e : { ...e, label: `${e.label} (Popout)` },
  ),
)

const currentMode = computed<PlayerMode | null>(() => entries.value[0]?.mode ?? null)

const selectableItems = computed(() => directory.value.filter((i) => i.owner === null))

const foreignIds = computed(() =>
  isPopout ? directory.value.filter((i) => i.owner !== myWindowId).map((i) => i.id) : [],
)

function itemToEntry(item: DirectoryItem): StreamEntry {
  return {
    id: item.id,
    channel: '',
    mode: item.mode,
    label: item.label,
    delay: 0,
    windowId: item.owner ?? undefined,
    color: item.color,
  }
}

const popoutSidebar = computed<StreamEntry[]>(() => {
  if (directory.value.length === 0) return entries.value
  return directory.value.map(
    (item) => entries.value.find((e) => e.id === item.id) ?? itemToEntry(item),
  )
})

const displayEntries = computed(() => (isPopout ? popoutSidebar.value : sidebarEntries.value))

const vodColors = computed(() => {
  const map: Record<string, string> = {}
  if (isPopout) {
    for (const e of entries.value) {
      if (e.color) map[e.id] = e.color
    }
    return map
  }
  entries.value
    .filter((e) => e.mode === 'vod')
    .forEach((e, idx) => {
      map[e.id] = VOD_COLORS[idx % VOD_COLORS.length]
    })
  return map
})

const hoveredId = ref<string | null>(null)

const timelineBars = computed(() =>
  bars.value.map((bar) => ({ ...bar, color: vodColors.value[bar.id] })),
)

let bridgeTimer: number | undefined
let stateTimer: number | undefined
let unsubscribeBridge: (() => void) | undefined

function onPageHide() {
  if (isPopout) {
    sendBridge({ type: 'return', from: myWindowId, ids: entries.value.map((e) => e.id) })
  } else {
    sendBridge({ type: 'main-closed' })
  }
}

onMounted(async () => {
  unsubscribeBridge = onBridge(handleBridgeMessage)
  window.addEventListener('pagehide', onPageHide)
  bridgeTimer = window.setInterval(bridgeTick, 1000)
  if (isPopout) stateTimer = window.setInterval(reportTileStates, 250)

  if (!isPopout) captureTokenFromHash()
  try {
    await loadTwitchIframe()
  } catch {
    loadError.value = true
    return
  }
  twitchReady.value = true

  if (isPopout) {
    sendBridge({ type: 'hello', from: myWindowId })
    return
  }

  const pending = takePendingStreams()
  if (pending) {
    urlStartSeconds = pending.startSeconds
    await addStreams(pending.streams, false)
  } else {
    await loadFromUrl()
  }

  if (entries.value.length > 0) {
    setActiveAudio(entries.value[0].id)
  }
  applyUrlStart()
})

onBeforeUnmount(() => {
  clearInterval(latencyTimer)
  clearInterval(bridgeTimer)
  clearInterval(stateTimer)
  unsubscribeBridge?.()
  window.removeEventListener('pagehide', onPageHide)
})

function bridgeTick() {
  if (isPopout) {
    sendBridge({ type: 'alive', from: myWindowId })
    if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) window.close()
    return
  }
  sendBridge({ type: 'heartbeat' })
  const now = Date.now()
  for (const [id, seen] of popoutSeen) {
    if (now - seen > HEARTBEAT_TIMEOUT_MS) {
      popoutSeen.delete(id)
      returnToMain(entries.value.filter((e) => e.windowId === id).map((e) => e.id))
    }
  }
}

function reportTileStates() {
  if (entries.value.length === 0) return
  sendBridge({
    type: 'state',
    from: myWindowId,
    items: entries.value.map((e) => ({
      id: e.id,
      currentTime: getPlayer(e.id)?.getCurrentTime() ?? 0,
    })),
  })
}

function handleBridgeMessage(msg: BridgeMessage) {
  if (msg.type === 'hover') {
    hoveredId.value = msg.id
    return
  }
  if (isPopout) {
    handlePopoutMessage(msg)
  } else {
    handleMainMessage(msg)
  }
}

function handleMainMessage(msg: BridgeMessage) {
  switch (msg.type) {
    case 'hello':
      popoutSeen.set(msg.from, Date.now())
      sendSettings()
      sendBridge({ type: 'audio', id: audioId.value })
      sendDirectory()
      break
    case 'alive':
      popoutSeen.set(msg.from, Date.now())
      break
    case 'take':
      adoptIntoPopout(msg.from, msg.ids)
      break
    case 'return':
      returnToMain(msg.ids)
      break
    case 'state':
      for (const item of msg.items) {
        remotePlayers.get(item.id)?.setCurrentTime(item.currentTime)
      }
      break
    case 'event': {
      const player = remotePlayers.get(msg.id)
      if (!player) break
      player.setCurrentTime(msg.currentTime)
      if (msg.name === 'ready') {
        applyRemoteVolumes()
        resync(msg.id)
      } else {
        onTileEvent(msg.id, msg.name === 'playing' ? 'playing' : 'pause')
      }
      break
    }
    case 'set-audio':
      setActiveAudio(msg.id)
      break
    case 'set-delay':
      setDelay(msg.id, msg.seconds)
      break
    case 'play-all':
      playEverything()
      break
    case 'pause-all':
      pauseEverything()
      break
    case 'sync':
      syncAll()
      break
    default:
      break
  }
}

function handlePopoutMessage(msg: BridgeMessage) {
  switch (msg.type) {
    case 'heartbeat':
      lastHeartbeat = Date.now()
      break
    case 'main-closed':
      window.close()
      break
    case 'settings':
      lightTheme.value = msg.lightTheme
      keepChatsLoaded.value = msg.keepChatsLoaded
      break
    case 'audio':
      audioId.value = msg.id
      break
    case 'directory':
      directory.value = msg.items
      break
    case 'adopt':
      if (msg.to === myWindowId) entries.value.push(...msg.entries)
      break
    case 'drop':
      if (msg.to === myWindowId) removeLocal(msg.id)
      break
    case 'patch':
      if (msg.to === myWindowId) {
        const entry = entries.value.find((e) => e.id === msg.id)
        if (entry) entry.delay = msg.delay
      }
      break
    case 'command':
      if (msg.to === myWindowId) executeCommand(msg.id, msg.op, msg.value)
      break
    default:
      break
  }
}

function executeCommand(id: string, op: Operation, value?: number) {
  const player = getPlayer(id)
  if (!player) return
  if (op === 'play') player.play()
  else if (op === 'pause') player.pause()
  else if (op === 'seek') player.seek(value ?? 0)
  else player.setVolume(value ?? 0)
}

function sendSettings() {
  if (isPopout) return
  sendBridge({
    type: 'settings',
    lightTheme: lightTheme.value,
    keepChatsLoaded: keepChatsLoaded.value,
  })
}

function sendDirectory() {
  if (isPopout) return
  sendBridge({
    type: 'directory',
    items: entries.value.map((e) => ({
      id: e.id,
      label: e.label,
      mode: e.mode,
      owner: e.windowId ?? null,
      color: vodColors.value[e.id],
    })),
  })
}

function setHover(id: string | null) {
  hoveredId.value = id
  sendBridge({ type: 'hover', id })
}

watch(entries, sendDirectory, { deep: true })
watch([lightTheme, keepChatsLoaded], sendSettings)

function adoptIntoPopout(to: string, ids: string[]) {
  const moved = entries.value.filter((e) => ids.includes(e.id) && !e.windowId)
  if (moved.length === 0) return
  popoutSeen.set(to, Date.now())
  for (const entry of moved) {
    entry.windowId = to
    remotePlayers.set(
      entry.id,
      new RemotePlayer((op, value) =>
        sendBridge({ type: 'command', to, id: entry.id, op, value }),
      ),
    )
  }
  sendBridge({
    type: 'adopt',
    to,
    entries: moved.map((e) => ({ ...e, color: vodColors.value[e.id] })),
  })
  sendDirectory()
}

function returnToMain(ids: string[]) {
  const returned = entries.value.filter((e) => ids.includes(e.id) && e.windowId)
  if (returned.length === 0) return
  for (const entry of returned) {
    remotePlayers.delete(entry.id)
    entry.windowId = undefined
  }
  entries.value = [...entries.value.filter((e) => !returned.includes(e)), ...returned]
  sendDirectory()
}

function openPopout() {
  const id = Math.random().toString(36).slice(2, 10)
  window.open(`${window.location.origin}/?popout=${id}`, `multitwitch-popout-${id}`, 'width=1280,height=720')
}

function takeSelected(ids: string[]) {
  sendBridge({ type: 'take', from: myWindowId, ids })
}

function onTileEvent(id: string, name: 'playing' | 'pause') {
  if (isPopout) {
    sendBridge({
      type: 'event',
      from: myWindowId,
      id,
      name,
      currentTime: getPlayer(id)?.getCurrentTime() ?? 0,
    })
    return
  }
  if (name === 'playing') {
    playback.onPlayerPlaying(id)
  } else {
    playback.onPlayerPaused(id)
  }
}

function applyRemoteVolumes() {
  for (const [id, player] of remotePlayers) {
    player.setVolume(id === audioId.value ? activeVolume.value : 0.01)
  }
}

function setActiveAudio(id: string) {
  if (isPopout) {
    sendBridge({ type: 'set-audio', from: myWindowId, id })
    return
  }
  setEmbedAudio(id)
  audioId.value = id
  sendBridge({ type: 'audio', id })
  applyRemoteVolumes()
}

function syncAll() {
  if (isPopout) {
    sendBridge({ type: 'sync', from: myWindowId })
  } else {
    syncPlayback()
  }
}

function pauseEverything() {
  if (isPopout) {
    sendBridge({ type: 'pause-all', from: myWindowId })
    return
  }
  if (currentMode.value === 'vod') {
    pause()
  } else {
    pauseAll()
    for (const player of remotePlayers.values()) player.pause()
  }
}

function playEverything() {
  if (isPopout) {
    sendBridge({ type: 'play-all', from: myWindowId })
    return
  }
  if (currentMode.value === 'vod') syncPlayback()
  playAll()
  for (const player of remotePlayers.values()) player.play()
}

let urlStartSeconds: number | null = null

async function loadFromUrl() {
  const specs: StreamSpec[] = []
  const segments = window.location.pathname
    .split('/')
    .map((s) => decodeURIComponent(s))
    .filter((s) => s.length > 0)

  for (const segment of segments) {
    const vod = segment.match(/^(\d+)(?::(-?\d+(?:\.\d+)?))?$/)
    if (vod) {
      specs.push({ channel: '', mode: 'vod', vodId: vod[1], delay: Number(vod[2] ?? 0) })
    } else if (segment.toLowerCase() === 'videos') {
      continue
    } else {
      const parsed = parseStreamInput(segment)
      if (parsed?.mode === 'live') {
        specs.push({ channel: parsed.channel, mode: 'live', vodId: '', delay: 0 })
      }
    }
  }

  urlStartSeconds = parseTimeParam(new URLSearchParams(window.location.search).get('t'))
  await addStreams(specs, true)
}

function applyUrlStart() {
  const r = range.value
  if (urlStartSeconds === null || !r) return
  seek(r.start + urlStartSeconds * 1000)
  urlStartSeconds = null
}

function buildShareUrl(): string {
  const segments = entries.value.map((e) =>
    e.mode === 'live' ? e.channel : e.delay ? `${e.vodId}:${e.delay}` : (e.vodId ?? ''),
  )
  const url = `${window.location.origin}/${segments.join('/')}`
  if (!range.value) return url
  return `${url}?t=${formatTimeParam((position.value - range.value.start) / 1000)}`
}

const copied = ref(false)
let copiedTimer: number | undefined

async function copyShareUrl() {
  try {
    await navigator.clipboard.writeText(buildShareUrl())
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    addError.value = 'Link konnte nicht kopiert werden'
  }
}

let nextId = 1

function generateId(): string {
  return `stream-${nextId++}`
}

function modeAllowed(mode: PlayerMode): boolean {
  return currentMode.value === null || currentMode.value === mode
}

function toSpec(entry: StreamEntry): StreamSpec {
  return {
    channel: entry.channel,
    mode: entry.mode,
    vodId: entry.vodId ?? '',
    delay: entry.delay,
  }
}

function addEntry(spec: StreamSpec, info?: VideoInfo) {
  entries.value.push({
    id: generateId(),
    channel: spec.channel,
    mode: spec.mode,
    vodId: spec.mode === 'vod' ? spec.vodId : undefined,
    label: spec.channel || info?.channel || `Video ${spec.vodId}`,
    delay: spec.delay,
    vodStart: info?.startDate.getTime(),
    duration: info?.duration,
  })
}

async function addStreams(specs: StreamSpec[], allowRedirect: boolean) {
  addError.value = null

  for (let index = 0; index < specs.length; index++) {
    const spec = specs[index]
    if (!modeAllowed(spec.mode)) {
      addError.value = 'Eingabe passt nicht zum aktuellen Modus (Live oder VOD)'
      continue
    }

    if (spec.mode === 'live') {
      addEntry(spec)
      continue
    }

    let info: VideoInfo
    try {
      info = await fetchVideoInfo(spec.vodId)
    } catch (err) {
      if (err instanceof AuthRequiredError && allowRedirect) {
        savePendingStreams([...entries.value.map(toSpec), ...specs.slice(index)], urlStartSeconds)
        redirectToLogin()
        return
      }
      addError.value = err instanceof AuthRequiredError
        ? 'Twitch-Anmeldung fehlgeschlagen'
        : 'VOD konnte nicht geladen werden'
      continue
    }

    if (!modeAllowed(spec.mode)) {
      addError.value = 'Eingabe passt nicht zum aktuellen Modus (Live oder VOD)'
      continue
    }
    addEntry(spec, info)
  }
}

function handleAdd(spec: StreamSpec) {
  void addStreams([spec], true)
}

function removeStream(id: string) {
  if (isPopout) {
    sendBridge({ type: 'return', from: myWindowId, ids: [id] })
  } else {
    const entry = entries.value.find((e) => e.id === id)
    if (entry?.windowId) sendBridge({ type: 'drop', to: entry.windowId, id })
  }
  remotePlayers.delete(id)
  removeLocal(id)
}

function removeLocal(id: string) {
  forget(id)
  destroyPlayer(id)
  entries.value = entries.value.filter((e) => e.id !== id)

  if (localEntries.value.length === 0) {
    viewMode.value = 'tiled'
    focusedId.value = null
  } else if (focusedId.value === id) {
    focusedId.value = defaultFocusId()
  }
}

function setDelay(id: string, seconds: number) {
  if (isPopout) {
    sendBridge({ type: 'set-delay', from: myWindowId, id, seconds })
    return
  }
  const entry = entries.value.find((e) => e.id === id)
  if (!entry) return
  entry.delay = seconds
  if (entry.windowId) {
    sendBridge({ type: 'patch', to: entry.windowId, id, delay: seconds })
  }
  resync(id)
}

function defaultFocusId(): string | null {
  const audible = localEntries.value.find((e) => e.id === audioId.value)
  return audible?.id ?? localEntries.value[0]?.id ?? null
}

function focusStream(id: string) {
  focusedId.value = id
}

function focusAndPlayAudio(id: string) {
  focusStream(id)
  setActiveAudio(id)
}

function toggleViewMode() {
  if (viewMode.value === 'focused') {
    viewMode.value = 'tiled'
    return
  }
  if (localEntries.value.length === 0) return
  focusedId.value = defaultFocusId()
  viewMode.value = 'focused'
}

function handlePlayerReady(id: string) {
  if (isPopout) {
    sendBridge({
      type: 'event',
      from: myWindowId,
      id,
      name: 'ready',
      currentTime: getPlayer(id)?.getCurrentTime() ?? 0,
    })
    return
  }
  const isFirst = entries.value[0]?.id === id
  setInitialVolume(id, isFirst)
  resync(id)
}

function getColumnCount(): string {
  const count = localEntries.value.length
  if (count <= 1) return '1'
  if (count <= 4) return '2'
  if (count <= 9) return '3'
  return '4'
}

const showPlayback = computed(() => entries.value.length > 0)

const splitHalf = computed(() => viewMode.value === 'focused' && localEntries.value.length >= 6)

const gridEl = ref<HTMLElement | null>(null)
const stripPx = ref<number | null>(null)
const stripPxStyle = computed(() => (stripPx.value === null ? undefined : `${stripPx.value}px`))
const HANDLE_GAP = 8
let resizing = false

function startResize(e: PointerEvent) {
  resizing = true
  const target = e.currentTarget as HTMLElement
  target.setPointerCapture(e.pointerId)
}

function onResize(e: PointerEvent) {
  if (!resizing || !gridEl.value || splitHalf.value) return
  const bottom = gridEl.value.getBoundingClientRect().bottom
  const minPx = window.innerHeight * 0.25 - HANDLE_GAP
  const maxPx = window.innerHeight * 0.75 - HANDLE_GAP
  const next = bottom - e.clientY - HANDLE_GAP / 2
  stripPx.value = Math.round(Math.min(Math.max(next, minPx), maxPx))
}

function endResize() {
  resizing = false
}

const latencyLabels = ref<Record<string, string>>({})

function updateLatencies() {
  const labels: Record<string, string> = {}
  for (const entry of localEntries.value) {
    if (entry.mode !== 'live') continue
    const seconds = getLatency(entry.id)
    labels[entry.id] = seconds === null ? '–' : `Latenz ${seconds.toFixed(1)} s`
  }
  latencyLabels.value = labels
}

let latencyTimer: number | undefined

onMounted(() => {
  latencyTimer = window.setInterval(updateLatencies, 1000)
})

const chatChannels = computed(() => [
  ...new Set(localEntries.value.filter((e) => e.mode === 'live').map((e) => e.channel)),
])

const activeChatChannel = computed(() =>
  chatChannels.value.includes(chatChannel.value ?? '')
    ? chatChannel.value
    : (chatChannels.value[0] ?? null),
)

watch([viewMode, focusedId], () => {
  if (viewMode.value !== 'focused') return
  const entry = localEntries.value.find((e) => e.id === focusedId.value)
  if (entry?.mode === 'live') {
    chatChannel.value = entry.channel
  }
})

function startChatResize(e: PointerEvent) {
  chatResizing = true
  const target = e.currentTarget as HTMLElement
  target.setPointerCapture(e.pointerId)
}

function onChatResize(e: PointerEvent) {
  if (!chatResizing) return
  const maxPx = window.innerWidth * 0.5
  const next = window.innerWidth - e.clientX - 3
  chatWidth.value = Math.round(Math.min(Math.max(next, 200), maxPx))
}

function endChatResize() {
  chatResizing = false
}

const thumbCount = computed(() => Math.max(localEntries.value.length - 1, 0))
const thumbRows = computed(() => (thumbCount.value > 5 ? 2 : 1))
const thumbCols = computed(() => Math.max(1, Math.ceil(thumbCount.value / thumbRows.value)))
const thumbVars = computed(() => ({
  '--thumb-cols': String(thumbCols.value),
  '--thumb-rows': String(thumbRows.value),
}))

const thumbPlacement = computed(() => {
  const placement: Record<string, { row: number; col: number }> = {}
  if (viewMode.value !== 'focused') return placement
  localEntries.value
    .filter((e) => e.id !== focusedId.value)
    .forEach((e, i) => {
      placement[e.id] = { row: 3 + Math.floor(i / thumbCols.value), col: (i % thumbCols.value) + 1 }
    })
  return placement
})
</script>

<template>
  <div class="app">
    <aside class="sidebar" :class="{ collapsed: !panelOpen }">
      <button class="panel-toggle" @click="panelOpen = !panelOpen">
        {{ panelOpen ? '\u25C0' : '\u25B6' }}
      </button>
      <div class="panel-content" v-show="panelOpen">
        <PopoutSelection v-if="isPopout" :items="selectableItems" @take="takeSelected" />
        <AddStreamForm
          v-if="twitchReady && !isPopout"
          :mode="currentMode"
          :error="addError"
          @add="handleAdd"
        />
        <button
          v-if="entries.length > 0"
          class="view-toggle"
          @click="toggleViewMode"
        >
          {{ viewMode === 'tiled' ? 'Fokusmodus' : 'Kachelmodus' }}
        </button>
        <button
          v-if="!isPopout && entries.length > 0"
          class="view-toggle"
          @click="openPopout"
        >
          Popout erstellen
        </button>
        <PlayerControls
          :entries="displayEntries"
          :readonly-ids="foreignIds"
          :latency="showLatency ? latencyLabels : {}"
          :active-audio-id="audioId"
          :show-playback="showPlayback"
          :mode="currentMode"
          :colors="vodColors"
          @hover="setHover"
          @play-all="playEverything"
          @pause-all="pauseEverything"
          @sync="syncAll"
          @remove="removeStream"
          @set-active-audio="setActiveAudio"
          @set-delay="setDelay"
        />
        <SettingsSection
          v-if="!isPopout && entries.length > 0"
          v-model:light-theme="lightTheme"
          v-model:show-latency="showLatency"
          v-model:keep-chats-loaded="keepChatsLoaded"
        />
        <button
          v-if="!isPopout && entries.length > 0"
          class="view-toggle"
          @click="copyShareUrl"
        >
          {{ copied ? 'Link kopiert' : 'Link kopieren' }}
        </button>
      </div>
      <div class="panel-compact" v-show="!panelOpen">
        <div class="spacer" style="height: 136px"></div>
        <button
          v-if="entries.length > 0"
          class="icon-btn"
          :title="viewMode === 'tiled' ? 'Fokusmodus' : 'Kachelmodus'"
          @click="toggleViewMode"
          style="margin-bottom: 6px;"
        >&#9633;</button>
        <template v-if="showPlayback && entries.length > 0">
          <button
            class="icon-btn"
            title="Alle starten"
            @click="playEverything"
            style="margin-bottom: 6px;"
          >&#9654;</button>
          <button
            class="icon-btn"
            title="Alle pausieren"
            @click="pauseEverything"
            :style="currentMode === 'vod' ? 'margin-bottom: 6px;' : ''"
          >&#10074;&#10074;</button>
          <button
            v-if="currentMode === 'vod'"
            class="icon-btn"
            title="Synchronisieren"
            @click="syncAll"
          >&#8635;</button>
        </template>
        <div class="spacer" style="height: 32px"></div>
        <template v-for="entry in displayEntries" :key="entry.id">
          <button
            class="icon-btn"
            :class="{ active: audioId === entry.id }"
            :title="entry.label"
            @click="setActiveAudio(entry.id)"
            style="height: 38px;"
            :style="vodColors[entry.id] ? { boxShadow: `inset 3px 0 0 ${vodColors[entry.id]}` } : undefined"
            @mouseenter="setHover(entry.id)"
            @mouseleave="setHover(null)"
          >
            <span v-if="audioId === entry.id" class="emoji-icon">&#128266;</span>
            <span v-else class="emoji-icon">&#128263;</span>
          </button>
        </template>
      </div>
    </aside>

    <div class="main">
      <section
        class="grid"
        ref="gridEl"
        :class="{
          'focus-mode': viewMode === 'focused',
          'has-thumbs': viewMode === 'focused' && localEntries.length > 1,
          'split-half': splitHalf,
        }"
        :style="{ '--cols': getColumnCount(), ...thumbVars, '--strip-px': stripPxStyle }"
        v-if="localEntries.length > 0"
      >
        <div
          v-for="entry in localEntries"
          :key="entry.id"
          class="grid-item"
          :class="{ 'is-focused': viewMode === 'focused' && entry.id === focusedId }"
          :style="thumbPlacement[entry.id] ? {
            gridRow: String(thumbPlacement[entry.id].row),
            gridColumn: String(thumbPlacement[entry.id].col),
          } : undefined"
        >
          <TwitchPlayerCard
            :entry="entry"
            :create-player="createPlayer"
            :destroy-player="destroyPlayer"
            @player-ready="handlePlayerReady"
          />
          <div
            v-if="hoveredId === entry.id && vodColors[entry.id]"
            class="hover-frame"
            :style="{
              boxShadow: `inset 0 0 0 4px ${vodColors[entry.id]}, 0 0 28px ${vodColors[entry.id]}`,
            }"
          ></div>
          <div
            v-if="viewMode === 'focused' && entry.id !== focusedId"
            class="thumb-overlay"
          >
            <div class="thumb-actions">
              <button
                class="thumb-action"
                title="Nur fokussieren"
                aria-label="Nur fokussieren"
                @click.stop="focusStream(entry.id)"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <circle cx="12" cy="12" r="8" />
                  <circle cx="12" cy="12" r="2" />
                  <line x1="12" y1="1" x2="12" y2="4" />
                  <line x1="12" y1="20" x2="12" y2="23" />
                  <line x1="1" y1="12" x2="4" y2="12" />
                  <line x1="20" y1="12" x2="23" y2="12" />
                </svg>
              </button>
              <button
                class="thumb-action"
                title="Fokussieren + Ton"
                aria-label="Fokussieren + Ton"
                @click.stop="focusAndPlayAudio(entry.id)"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 5 6 9H2v6h4l5 4V5z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  <path d="M19 5a10 10 0 0 1 0 14" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div
          v-if="viewMode === 'focused' && localEntries.length > 1 && !splitHalf"
          class="resize-handle"
          @pointerdown="startResize"
          @pointermove="onResize"
          @pointerup="endResize"
          @pointercancel="endResize"
        ></div>
      </section>

      <section class="empty-state" v-else-if="loadError">
        <div class="empty-icon">&#9888;</div>
        <h2>Twitch-Player nicht verfuegbar</h2>
        <p>Das Twitch-Skript konnte nicht geladen werden. Bitte Netzwerk oder Werbeblocker pruefen und die Seite neu laden.</p>
      </section>

      <section class="empty-state" v-else-if="twitchReady && isPopout">
        <div class="empty-icon">📺</div>
        <h2>Keine Streams im Popout</h2>
        <p>Waehle links Streams aus dem Hauptfenster aus und uebernimm sie.</p>
      </section>

      <section class="empty-state" v-else-if="twitchReady">
        <div class="empty-icon">📺</div>
        <h2>Keine Streams hinzugefuegt</h2>
        <p>Fuege links einen Twitch-Kanal oder ein VOD hinzu, um zu beginnen.</p>
      </section>

      <Timeline
        v-if="range && !isPopout"
        :start="range.start"
        :end="range.end"
        :position="position"
        :bars="timelineBars"
        @seek="seek"
        @skip="skip"
      />
    </div>

    <div
      v-if="chatChannels.length > 0 && chatOpen"
      class="chat-resize"
      @pointerdown="startChatResize"
      @pointermove="onChatResize"
      @pointerup="endChatResize"
      @pointercancel="endChatResize"
    ></div>

    <ChatPanel
      v-if="chatChannels.length > 0"
      :channels="chatChannels"
      :active-channel="activeChatChannel"
      :width="chatWidth"
      :collapsed="!chatOpen"
      :keep-loaded="keepChatsLoaded"
      :dark-chat="!lightTheme"
      @select="chatChannel = $event"
      @toggle="chatOpen = !chatOpen"
    />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sidebar {
  width: 300px;
  min-width: 300px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  transition: width 0.2s, min-width 0.2s;
  position: relative;
}

.sidebar.collapsed {
  width: 44px;
  min-width: 44px;
}

.panel-toggle {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar.collapsed .panel-toggle {
  right: 8px;
}

.panel-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  padding-top: 36px;
}

.panel-compact {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 40px;
}

.spacer {
  width: 100%;
}

.icon-btn {
  width: 35px;
  height: 35px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.icon-btn:hover {
  background: var(--border);
  color: var(--text-primary);
}

.icon-btn.active {
  color: #22c55e;
  border-color: #22c55e;
}

.grid {
  --gap: 8px;
  --strip-h: clamp(calc(25vh - var(--gap)), var(--strip-px, 25vh), calc(75vh - var(--gap)));
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  gap: 2px;
  overflow: hidden;
}

.grid-item {
  position: relative;
  overflow: hidden;
  padding: 1px;
}

.grid.focus-mode {
  grid-template-columns: repeat(var(--thumb-cols), minmax(0, 1fr));
  grid-template-rows: minmax(0, 1fr) 12px repeat(
    var(--thumb-rows),
    minmax(0, calc((var(--strip-h) - (var(--thumb-rows) - 1) * 0px) / var(--thumb-rows)))
  );
  gap: 0px 2px;
}

.grid.focus-mode:not(.has-thumbs) {
  grid-template-rows: minmax(0, 1fr);
}

.grid.focus-mode.split-half {
  grid-template-rows: minmax(0, 1fr) 12px repeat(
    var(--thumb-rows),
    minmax(0, calc((100% - 12px) / 2 / var(--thumb-rows)))
  );
}

.grid.focus-mode .grid-item {
  min-width: 0;
  min-height: 0;
}

.grid.focus-mode .grid-item.is-focused {
  grid-column: 1 / -1;
  grid-row: 1;
}

.hover-frame {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  border-radius: 2px;
  animation:
    hover-frame-in 0.25s ease-out,
    hover-frame-pulse 1.4s ease-in-out 0.25s infinite;
}

@keyframes hover-frame-in {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes hover-frame-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.45;
    transform: scale(0.99);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hover-frame {
    animation: none;
  }
}

.grid.focus-mode .grid-item:not(.is-focused) {
  padding-top: 22px;
}

.thumb-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 22px;
  z-index: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.chat-resize {
  position: relative;
  flex-shrink: 0;
  width: 6px;
  cursor: col-resize;
  touch-action: none;
}

.chat-resize::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: var(--border);
}

.chat-resize:hover::after {
  background: var(--accent);
}

.resize-handle {
  position: relative;
  grid-column: 1 / -1;
  grid-row: 2;
  height: 12px;
  cursor: row-resize;
  touch-action: none;
}

.resize-handle::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 2px;
  transform: translateY(-50%);
  background: var(--border);
}

.resize-handle:hover::after {
  background: var(--accent);
}

.thumb-actions {
  display: flex;
  align-items: center;
  gap: 0;
  width: 100%;
  height: 100%;
}

.thumb-action {
  flex: 1;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 0;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  padding: 0;
}

.thumb-action:first-child {
  border-radius: 4px 0 0 0;
  margin-left: 8px;
}

.thumb-action:last-child {
  border-radius: 0 4px 0 0;
  margin-right: 8px;
}

.thumb-action svg {
  width: 12px;
  height: 12px;
}

.thumb-action:hover {
  background: var(--accent);
  border-color: var(--accent);
}

.view-toggle {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.view-toggle:hover:not(:disabled) {
  background: var(--border);
}

.view-toggle:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-state h2 {
  font-size: 18px;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.empty-state p {
  font-size: 14px;
}
</style>
