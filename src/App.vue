<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import type { StreamEntry, PlayerMode } from './types'
import { useTwitchEmbed } from './composables/useTwitchEmbed'
import { useSync } from './composables/useSync'
import TwitchPlayerCard from './components/TwitchPlayerCard.vue'
import AddStreamForm from './components/AddStreamForm.vue'
import SyncControls from './components/SyncControls.vue'
import PlayerControls from './components/PlayerControls.vue'

const entries = ref<StreamEntry[]>([])
const {
  loadTwitchIframe, createPlayer, getPlayer, destroyPlayer,
  playAll, pauseAll,
  activeAudioId, setInitialVolume, setActiveAudio,
} = useTwitchEmbed()
const { syncOnce, recordAllOffsets, setMaster } =
  useSync(entries.value, getPlayer)

const twitchReady = ref(false)
const panelOpen = ref(true)

onMounted(async () => {
  await loadTwitchIframe()
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
    } else {
      addStream(segment, 'live', '')
    }
  }
}

let nextId = 1

function generateId(): string {
  return `stream-${nextId++}`
}

async function addStream(channel: string, mode: PlayerMode, vodId: string) {
  const entry: StreamEntry = {
    id: generateId(),
    channel,
    mode,
    vodId: mode === 'vod' ? vodId : undefined,
    offset: 0,
    isMaster: entries.value.length === 0 && mode === 'vod',
    label: channel || `Video ${vodId}`,
  }

  entries.value.push(entry)

  await nextTick()

  if (entries.value.length === 1 && mode === 'vod') {
    setMaster(entry.id)
  }
}

function removeStream(id: string) {
  destroyPlayer(id)
  entries.value = entries.value.filter((e) => e.id !== id)
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
</script>

<template>
  <div class="app">
    <aside class="sidebar" :class="{ collapsed: !panelOpen }">
      <button class="panel-toggle" @click="panelOpen = !panelOpen">
        {{ panelOpen ? '\u25C0' : '\u25B6' }}
      </button>
      <div class="panel-content" v-show="panelOpen">
        <AddStreamForm v-if="twitchReady" @add="addStream" />
        <PlayerControls
          :entries="entries"
          :active-audio-id="activeAudioId"
          @play-all="playAll"
          @pause-all="pauseAll"
          @remove="removeStream"
          @set-active-audio="setActiveAudio"
        />
        <SyncControls
          v-if="entries.some((e) => e.mode === 'vod')"
          @sync="syncOnce"
          @record-offsets="recordAllOffsets"
        />
      </div>
      <div class="panel-compact" v-show="!panelOpen">
        <div class="spacer" style="height: 136px"></div>
        <button class="icon-btn" title="Alle starten" @click="playAll" style="margin-bottom: 6px;">&#9654;</button>
        <button class="icon-btn" title="Alle pausieren" @click="pauseAll">&#10074;&#10074;</button>
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
      :style="{ '--cols': getColumnCount() }"
      v-if="entries.length > 0"
    >
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="grid-item"
      >
        <TwitchPlayerCard
          :entry="entry"
          :create-player="createPlayer"
          :get-player="getPlayer"
          :destroy-player="destroyPlayer"
          @player-ready="handlePlayerReady"
        />
      </div>
    </section>

    <section class="empty-state" v-else-if="twitchReady">
      <div class="empty-icon">📺</div>
      <h2>Keine Streams hinzugefuegt</h2>
      <p>Fuege links einen Twitch-Kanal oder ein VOD hinzu, um zu beginnen.</p>
    </section>
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
  flex: 1;
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  overflow: hidden;
}

.grid-item {
  position: relative;
  overflow: hidden;
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
