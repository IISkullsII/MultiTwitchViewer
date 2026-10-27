<script setup lang="ts">
import type { PlayerMode, StreamEntry } from '../types'

const props = withDefaults(
  defineProps<{
    entries: StreamEntry[]
    activeAudioId: string | null
    showPlayback: boolean
    mode: PlayerMode | null
    colors: Record<string, string>
    readonlyIds?: string[]
  }>(),
  { readonlyIds: () => [] },
)

const emit = defineEmits<{
  playAll: []
  pauseAll: []
  sync: []
  remove: [id: string]
  setActiveAudio: [id: string]
  setDelay: [id: string, seconds: number]
  hover: [id: string | null]
}>()

function onDelayChange(id: string, evt: Event) {
  const value = Number((evt.target as HTMLInputElement).value)
  emit('setDelay', id, Number.isFinite(value) ? value : 0)
}
</script>

<template>
  <div class="player-controls">
    <h3 v-if="entries.length > 0" class="section-title">Wiedergabe</h3>
    <template v-if="showPlayback && entries.length > 0">
      <div v-if="mode !== 'vod'" class="control-row" @click="emit('playAll')">
        <span>Alle starten</span>
        <span class="symbol">&#9654;</span>
      </div>
      <div class="control-row" @click="emit('pauseAll')">
        <span>Alle pausieren</span>
        <span class="symbol">&#10074;&#10074;</span>
      </div>
      <div v-if="mode === 'vod'" class="control-row" @click="emit('sync')">
        <span>Synchronisieren</span>
        <span class="symbol">&#8635;</span>
      </div>
    </template>

    <template v-if="entries.length > 0">
      <h3 class="section-title">Streams</h3>
      <ul class="stream-list">
        <li
          v-for="entry in entries"
          :key="entry.id"
          class="stream-row"
          @mouseenter="emit('hover', entry.id)"
          @mouseleave="emit('hover', null)"
        >
          <div
            class="stream-info"
            :style="colors[entry.id] ? { borderLeft: `3px solid ${colors[entry.id]}` } : undefined"
          >
            <span class="stream-name">{{ entry.label }}</span>
            <span class="delay-field" v-if="entry.mode === 'vod' && !props.readonlyIds.includes(entry.id)" title="Verzoegerung in Sekunden">
              <input
                class="delay-input"
                type="number"
                step="0.1"
                :value="entry.delay"
                @change="onDelayChange(entry.id, $event)"
              />
              <span class="delay-unit">s</span>
            </span>
            <button
              v-if="!props.readonlyIds.includes(entry.id)"
              class="btn-remove"
              title="Entfernen"
              @click.stop="emit('remove', entry.id)"
            >
              &#10005;
            </button>
          </div>
          <button
            class="btn-speaker"
            :class="{ active: $props.activeAudioId === entry.id }"
            :title="$props.activeAudioId === entry.id ? 'Aktiver Ton' : 'Ton umschalten'"
            @click="emit('setActiveAudio', entry.id)"
          >
            <span v-if="$props.activeAudioId === entry.id" class="emoji-icon">&#128266;</span>
            <span v-else class="emoji-icon">&#128263;</span>
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.player-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-title {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 4px;
}

.control-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.control-row:hover {
  background: var(--border);
}

.symbol {
  font-size: 12px;
  opacity: 0.7;
}

.stream-list {
  list-style: none;
  display: flex;
  flex-direction: column;
}

.stream-row {
  display: flex;
}

.stream-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 6px 0 0 6px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-right: none;
  font-size: 13px;
  min-width: 0;
}

.stream-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.delay-field {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.delay-input {
  width: 64px;
  padding: 2px 4px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}

.delay-input:focus {
  border-color: var(--accent);
}

.delay-unit {
  font-size: 12px;
  color: var(--text-secondary);
}

.btn-remove {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.btn-remove:hover {
  color: var(--danger);
}

.btn-speaker {
  width: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 0 6px 6px 0;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
}

.btn-speaker:hover {
  background: var(--border);
}

.btn-speaker.active {
  color: #22c55e;
}
</style>
