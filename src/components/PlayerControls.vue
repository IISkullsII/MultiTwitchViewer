<script setup lang="ts">
import type { StreamEntry } from '../types'

defineProps<{
  entries: StreamEntry[]
  activeAudioId: string | null
  showPlayback: boolean
}>()

const emit = defineEmits<{
  playAll: []
  pauseAll: []
  remove: [id: string]
  setActiveAudio: [id: string]
}>()
</script>

<template>
  <div class="player-controls">
    <h3 class="section-title">Wiedergabe</h3>
    <template v-if="showPlayback">
      <div class="control-row" @click="emit('playAll')">
        <span>Alle starten</span>
        <span class="symbol">&#9654;</span>
      </div>
      <div class="control-row" @click="emit('pauseAll')">
        <span>Alle pausieren</span>
        <span class="symbol">&#10074;&#10074;</span>
      </div>
    </template>

    <template v-if="entries.length > 0">
      <h3 class="section-title">Streams</h3>
      <ul class="stream-list">
        <li v-for="entry in entries" :key="entry.id" class="stream-row">
          <div class="stream-info">
            <span class="stream-name">
              {{ entry.label }}
              <span class="badge" v-if="entry.isMaster">M</span>
            </span>
            <button
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

.badge {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  background: var(--accent);
  color: white;
  flex-shrink: 0;
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
