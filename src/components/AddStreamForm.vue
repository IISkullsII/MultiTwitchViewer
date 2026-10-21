<script setup lang="ts">
import { ref, computed } from 'vue'
import type { PlayerMode } from '../types'
import { parseStreamInput } from '../utils/parseStreamInput'

const emit = defineEmits<{
  add: [channel: string, mode: PlayerMode, vodId: string]
}>()

const input = ref('')

const parsed = computed(() => parseStreamInput(input.value))
const detectedType = computed(() => parsed.value?.mode ?? null)

function handleAdd() {
  const result = parsed.value
  if (!result) return
  if (result.mode === 'vod' && !result.vodId) return
  if (result.mode === 'live' && !result.channel) return

  emit('add', result.channel, result.mode, result.vodId)
  input.value = ''
}
</script>

<template>
  <div class="add-stream-form">
    <h3 class="section-title">Hinzufuegen</h3>
    <input
      v-model="input"
      type="text"
      placeholder="Twitch-URL oder Channel-Name..."
      class="input"
      @keyup.enter="handleAdd"
    />
    <span class="detected" v-if="detectedType === 'live'">Live erkannt</span>
    <span class="detected vod" v-else-if="detectedType === 'vod'">VOD erkannt</span>
    <span class="detected invalid" v-else-if="input.trim()">Ungueltige Eingabe</span>
    <div class="control-row" :class="{ disabled: !parsed }" @click="parsed && handleAdd()">
      <span>Hinzufuegen</span>
      <span class="symbol">+</span>
    </div>
  </div>
</template>

<style scoped>
.add-stream-form {
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

.input {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.input:focus {
  border-color: var(--accent);
}

.detected {
  font-size: 12px;
  color: #22c55e;
  font-weight: 600;
}

.detected.vod {
  color: #3b82f6;
}

.detected.invalid {
  color: var(--danger);
}

.control-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--accent);
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.control-row:hover {
  background: var(--accent-hover);
}

.control-row.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.control-row.disabled:hover {
  background: var(--accent);
}

.symbol {
  font-size: 16px;
  font-weight: 700;
}
</style>
