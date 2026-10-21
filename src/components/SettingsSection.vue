<script setup lang="ts">
import { ref } from 'vue'

const lightTheme = defineModel<boolean>('lightTheme', { required: true })
const showLatency = defineModel<boolean>('showLatency', { required: true })
const keepChatsLoaded = defineModel<boolean>('keepChatsLoaded', { required: true })

const open = ref(false)
</script>

<template>
  <div class="settings-section">
    <button class="section-header" @click="open = !open">
      <span>Einstellungen</span>
      <span class="symbol">{{ open ? '\u25BE' : '\u25B8' }}</span>
    </button>
    <div v-if="open" class="settings-body">
      <label class="setting-row">
        <span>Helles Design</span>
        <input v-model="lightTheme" type="checkbox" />
      </label>
      <label class="setting-row">
        <span>Chats im Hintergrund laden</span>
        <input v-model="keepChatsLoaded" type="checkbox" />
      </label>
      <label class="setting-row">
        <span>Debug information</span>
        <input v-model="showLatency" type="checkbox" />
      </label>
    </div>
  </div>
</template>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: background 0.15s;
}

.section-header:hover {
  background: var(--border);
}

.symbol {
  font-size: 12px;
  opacity: 0.7;
}

.settings-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  cursor: pointer;
}

.setting-row input {
  accent-color: var(--accent);
}
</style>
