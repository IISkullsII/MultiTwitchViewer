<script setup lang="ts">
import { ref, computed, watch, watchEffect, onMounted, onBeforeUnmount } from 'vue'
import type { StreamEntry, PlayerMode } from './types'
import { useTwitchEmbed } from './composables/useTwitchEmbed'
import { useSync } from './composables/useSync'
import { parseStreamInput } from './utils/parseStreamInput'
import TwitchPlayerCard from './components/TwitchPlayerCard.vue'
import AddStreamForm from './components/AddStreamForm.vue'
import SyncControls from './components/SyncControls.vue'
import PlayerControls from './components/PlayerControls.vue'
import SettingsSection from './components/SettingsSection.vue'
import ChatPanel from './components/ChatPanel.vue'

const entries = ref<StreamEntry[]>([])
const {
  loadTwitchIframe, createPlayer, getPlayer, destroyPlayer,
  playAll, pauseAll,
  activeAudioId, setInitialVolume, setActiveAudio, getLatency,
} = useTwitchEmbed()
const { syncOnce, recordAllOffsets, ensureMaster } =
  useSync(() => entries.value, getPlayer)

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

onMounted(async () => {
  try {
    await loadTwitchIframe()
  } catch {
    loadError.value = true
    return
  }
  twitchReady.value = true
  loadFromUrl()
})

function loadFromUrl() {
  const segments = window.location.pathname
    .split('/')
    .filter((s) => s.length > 0)

  for (const segment of segments) {
    if (/^\d+$/.test(segment)) {
      addStream('', 'vod', segment)
    } else if (segment.toLowerCase() === 'videos') {
      continue
    } else {
      const parsed = parseStreamInput(segment)
      if (parsed?.mode === 'live') {
        addStream(parsed.channel, 'live', '')
      }
    }
  }

  if (entries.value.length > 0) {
    setActiveAudio(entries.value[0].id)
  }
}

let nextId = 1

function generateId(): string {
  return `stream-${nextId++}`
}

function addStream(channel: string, mode: PlayerMode, vodId: string) {
  const entry: StreamEntry = {
    id: generateId(),
    channel,
    mode,
    vodId: mode === 'vod' ? vodId : undefined,
    offset: 0,
    isMaster: false,
    label: channel || `Video ${vodId}`,
  }

  entries.value.push(entry)
  ensureMaster()
}

function removeStream(id: string) {
  destroyPlayer(id)
  entries.value = entries.value.filter((e) => e.id !== id)
  ensureMaster()

  if (entries.value.length === 0) {
    viewMode.value = 'tiled'
    focusedId.value = null
  } else if (focusedId.value === id) {
    focusedId.value = defaultFocusId()
  }
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
  const entry = entries.value.find((e) => e.id === id)
  if (entry) {
    setInitialVolume(id, entry.isMaster)
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
        <AddStreamForm v-if="twitchReady" @add="addStream" />
        <button
          class="view-toggle"
          :disabled="entries.length === 0"
          @click="toggleViewMode"
        >
          {{ viewMode === 'tiled' ? 'Fokusmodus' : 'Kachelmodus' }}
        </button>
        <PlayerControls
          :entries="entries"
          :active-audio-id="activeAudioId"
          :show-playback="showPlayback"
          @play-all="playAll"
          @pause-all="pauseAll"
          @remove="removeStream"
          @set-active-audio="setActiveAudio"
        />
        <SettingsSection
          v-model:light-theme="lightTheme"
          v-model:show-latency="showLatency"
          v-model:keep-chats-loaded="keepChatsLoaded"
        />
        <SyncControls
          v-if="entries.some((e) => e.mode === 'vod')"
          @sync="syncOnce"
          @record-offsets="recordAllOffsets"
        />
      </div>
      <div class="panel-compact" v-show="!panelOpen">
        <div class="spacer" style="height: 136px"></div>
        <button
          class="icon-btn"
          :title="viewMode === 'tiled' ? 'Fokusmodus' : 'Kachelmodus'"
          :disabled="entries.length === 0"
          @click="toggleViewMode"
          style="margin-bottom: 6px;"
        >&#9633;</button>
        <template v-if="showPlayback">
          <button class="icon-btn" title="Alle starten" @click="playAll" style="margin-bottom: 6px;">&#9654;</button>
          <button class="icon-btn" title="Alle pausieren" @click="pauseAll">&#10074;&#10074;</button>
        </template>
        <div class="spacer" style="height: 32px"></div>
        <template v-for="entry in entries" :key="entry.id">
          <button
            class="icon-btn"
            :class="{ active: activeAudioId === entry.id }"
            :title="entry.label"
            @click="setActiveAudio(entry.id)"
            style="height: 38px;"
          >
            <span v-if="activeAudioId === entry.id" class="emoji-icon">&#128266;</span>
            <span v-else class="emoji-icon">&#128263;</span>
          </button>
        </template>
        <template v-if="entries.some((e) => e.mode === 'vod')">
          <div class="spacer" style="height: 41px"></div>
          <button class="icon-btn" title="Verschiebung speichern" @click="recordAllOffsets" style="margin-bottom: 6px;">&#9670;</button>
          <button class="icon-btn" title="Synchronisieren" @click="syncOnce">&#8634;</button>
        </template>
      </div>
    </aside>

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
          v-if="viewMode === 'focused' && entry.id !== focusedId"
          class="thumb-overlay"
          @click="focusStream(entry.id)"
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

.thumb-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  cursor: pointer;
}

.thumb-overlay:hover {
  box-shadow: inset 0 0 0 2px var(--accent);
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
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.55);
  opacity: 0;
  transition: opacity 0.15s;
}

.thumb-overlay:hover .thumb-actions {
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
