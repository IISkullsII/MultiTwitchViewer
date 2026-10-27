<script setup lang="ts">
import { ref, computed, watch, watchEffect, onMounted, onBeforeUnmount } from 'vue'
import type { StreamEntry, StreamSpec, PlayerMode } from './types'
import { useTwitchEmbed } from './composables/useTwitchEmbed'
import { usePlayback } from './composables/usePlayback'
import { parseStreamInput } from './utils/parseStreamInput'
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
import { VOD_COLORS } from './utils/colors'

const entries = ref<StreamEntry[]>([])
const addError = ref<string | null>(null)
const {
  loadTwitchIframe, createPlayer, getPlayer, destroyPlayer,
  playAll, pauseAll,
  activeAudioId, setInitialVolume, setActiveAudio, getLatency,
} = useTwitchEmbed({
  onPlaying: (id) => playback.onPlayerPlaying(id),
  onPaused: (id) => playback.onPlayerPaused(id),
})

const playback = usePlayback(() => entries.value, getPlayer)
const { position, range, bars, pause, seek, skip, sync, resync, forget } = playback

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

const currentMode = computed<PlayerMode | null>(() => entries.value[0]?.mode ?? null)

const vodColors = computed(() => {
  const map: Record<string, string> = {}
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

onMounted(async () => {
  captureTokenFromHash()
  try {
    await loadTwitchIframe()
  } catch {
    loadError.value = true
    return
  }
  twitchReady.value = true

  const pending = takePendingStreams()
  if (pending.length > 0) {
    await addStreams(pending, false)
  } else {
    await loadFromUrl()
  }

  if (entries.value.length > 0) {
    setActiveAudio(entries.value[0].id)
  }
})

async function loadFromUrl() {
  const specs: StreamSpec[] = []
  const segments = window.location.pathname
    .split('/')
    .filter((s) => s.length > 0)

  for (const segment of segments) {
    if (/^\d+$/.test(segment)) {
      specs.push({ channel: '', mode: 'vod', vodId: segment, delay: 0 })
    } else if (segment.toLowerCase() === 'videos') {
      continue
    } else {
      const parsed = parseStreamInput(segment)
      if (parsed?.mode === 'live') {
        specs.push({ channel: parsed.channel, mode: 'live', vodId: '', delay: 0 })
      }
    }
  }

  await addStreams(specs, true)
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
        savePendingStreams([...entries.value.map(toSpec), ...specs.slice(index)])
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
  forget(id)
  destroyPlayer(id)
  entries.value = entries.value.filter((e) => e.id !== id)

  if (entries.value.length === 0) {
    viewMode.value = 'tiled'
    focusedId.value = null
  } else if (focusedId.value === id) {
    focusedId.value = defaultFocusId()
  }
}

function setDelay(id: string, seconds: number) {
  const entry = entries.value.find((e) => e.id === id)
  if (!entry) return
  entry.delay = seconds
  resync(id)
}

function defaultFocusId(): string | null {
  const audible = entries.value.find((e) => e.id === activeAudioId.value)
  return audible?.id ?? entries.value[0]?.id ?? null
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
  if (entries.value.length === 0) return
  focusedId.value = defaultFocusId()
  viewMode.value = 'focused'
}

function handlePlayerReady(id: string) {
  const isFirst = entries.value[0]?.id === id
  setInitialVolume(id, isFirst)
  resync(id)
}

function pauseEverything() {
  if (currentMode.value === 'vod') {
    pause()
  } else {
    pauseAll()
  }
}

function getColumnCount(): string {
  const count = entries.value.length
  if (count <= 1) return '1'
  if (count <= 4) return '2'
  if (count <= 9) return '3'
  return '4'
}

const showPlayback = computed(
  () => entries.value.length === 0 || entries.value.some((e) => e.mode === 'vod'),
)

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
  if (!resizing || !gridEl.value) return
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
  for (const entry of entries.value) {
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

onBeforeUnmount(() => {
  clearInterval(latencyTimer)
})

const chatChannels = computed(() => [
  ...new Set(entries.value.filter((e) => e.mode === 'live').map((e) => e.channel)),
])

const activeChatChannel = computed(() =>
  chatChannels.value.includes(chatChannel.value ?? '')
    ? chatChannel.value
    : (chatChannels.value[0] ?? null),
)

watch([viewMode, focusedId], () => {
  if (viewMode.value !== 'focused') return
  const entry = entries.value.find((e) => e.id === focusedId.value)
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

const thumbCount = computed(() => Math.max(entries.value.length - 1, 0))
const thumbRows = computed(() => (thumbCount.value > 5 ? 2 : 1))
const thumbVars = computed(() => ({
  '--thumb-cols': String(Math.max(1, Math.ceil(thumbCount.value / thumbRows.value))),
  '--thumb-rows': String(thumbRows.value),
}))
</script>

<template>
  <div class="app">
    <aside class="sidebar" :class="{ collapsed: !panelOpen }">
      <button class="panel-toggle" @click="panelOpen = !panelOpen">
        {{ panelOpen ? '\u25C0' : '\u25B6' }}
      </button>
      <div class="panel-content" v-show="panelOpen">
        <AddStreamForm
          v-if="twitchReady"
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
        <PlayerControls
          :entries="entries"
          :active-audio-id="activeAudioId"
          :show-playback="showPlayback"
          :mode="currentMode"
          :colors="vodColors"
          @hover="hoveredId = $event"
          @play-all="playAll"
          @pause-all="pauseEverything"
          @sync="sync"
          @remove="removeStream"
          @set-active-audio="setActiveAudio"
          @set-delay="setDelay"
        />
        <SettingsSection
          v-if="entries.length > 0"
          v-model:light-theme="lightTheme"
          v-model:show-latency="showLatency"
          v-model:keep-chats-loaded="keepChatsLoaded"
        />
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
            v-if="currentMode !== 'vod'"
            class="icon-btn"
            title="Alle starten"
            @click="playAll"
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
            @click="sync"
          >&#8635;</button>
        </template>
        <div class="spacer" style="height: 32px"></div>
        <template v-for="entry in entries" :key="entry.id">
          <button
            class="icon-btn"
            :class="{ active: activeAudioId === entry.id }"
            :title="entry.label"
            @click="setActiveAudio(entry.id)"
            style="height: 38px;"
            :style="vodColors[entry.id] ? { boxShadow: `inset 3px 0 0 ${vodColors[entry.id]}` } : undefined"
            @mouseenter="hoveredId = entry.id"
            @mouseleave="hoveredId = null"
          >
            <span v-if="activeAudioId === entry.id" class="emoji-icon">&#128266;</span>
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
          'has-thumbs': viewMode === 'focused' && entries.length > 1,
        }"
        :style="{ '--cols': getColumnCount(), ...thumbVars, '--strip-px': stripPxStyle }"
        v-if="entries.length > 0"
      >
        <div
          v-for="entry in entries"
          :key="entry.id"
          class="grid-item"
          :class="{ 'is-focused': viewMode === 'focused' && entry.id === focusedId }"
        >
          <TwitchPlayerCard
            :entry="entry"
            :create-player="createPlayer"
            :destroy-player="destroyPlayer"
            @player-ready="handlePlayerReady"
          />
          <div
            v-if="showLatency && latencyLabels[entry.id]"
            class="latency-badge"
          >{{ latencyLabels[entry.id] }}</div>
          <div
            v-if="hoveredId === entry.id && vodColors[entry.id]"
            class="hover-frame"
            :style="{
              boxShadow: `inset 0 0 0 2px ${vodColors[entry.id]}, 0 0 16px ${vodColors[entry.id]}66`,
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
          v-if="viewMode === 'focused' && entries.length > 1"
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

      <section class="empty-state" v-else-if="twitchReady">
        <div class="empty-icon">📺</div>
        <h2>Keine Streams hinzugefuegt</h2>
        <p>Fuege links einen Twitch-Kanal oder ein VOD hinzu, um zu beginnen.</p>
      </section>

      <Timeline
        v-if="range"
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
  overflow: hidden;
}

.grid-item {
  position: relative;
  overflow: hidden;
}

.grid.focus-mode {
  grid-template-columns: repeat(var(--thumb-cols), minmax(0, 1fr));
  grid-template-rows: minmax(0, 1fr) repeat(
    var(--thumb-rows),
    minmax(0, calc((var(--strip-h) - (var(--thumb-rows) - 1) * var(--gap)) / var(--thumb-rows)))
  );
  gap: var(--gap);
}

.grid.focus-mode:not(.has-thumbs) {
  grid-template-rows: minmax(0, 1fr);
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
    hover-frame-in 0.2s ease-out,
    hover-frame-pulse 2.4s ease-in-out 0.2s infinite;
}

@keyframes hover-frame-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes hover-frame-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hover-frame {
    animation: none;
  }
}

.thumb-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
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

.latency-badge {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 2;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: var(--text-primary);
  font-size: 12px;
  pointer-events: none;
}

.resize-handle {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% - var(--strip-h) - var(--gap) / 2 - 6px);
  height: 12px;
  z-index: 2;
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
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 18px 12px;
  border-radius: 0 0 16px 16px;
  background: rgba(0, 0, 0, 0.8);
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: auto;
}

.grid-item:hover .thumb-actions {
  opacity: 1;
}

.thumb-action {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
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
