<script setup lang="ts">
import { ref, computed } from 'vue'
import type { PlayerMode, StreamSpec } from '../types'
import { parseStreamInput } from '../utils/parseStreamInput'

const props = defineProps<{
  mode: PlayerMode | null
  error: string | null
}>()

const emit = defineEmits<{
  add: [spec: StreamSpec]
}>()

const input = ref('')

const parsed = computed(() => parseStreamInput(input.value))
const blocked = computed(
  () => !!parsed.value && props.mode !== null && parsed.value.mode !== props.mode,
)
const canAdd = computed(() => !!parsed.value && !blocked.value)

function handleAdd() {
  const result = parsed.value
  if (!result || blocked.value) return
  if (result.mode === 'vod' && !result.vodId) return
  if (result.mode === 'live' && !result.channel) return

  emit('add', { channel: result.channel, mode: result.mode, vodId: result.vodId, delay: 0 })
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
    <span class="detected invalid" v-if="blocked">
      {{ mode === 'vod' ? 'Im VOD-Modus nur VODs erlaubt' : 'Im Live-Modus nur Kanaele erlaubt' }}
    </span>
    <span class="detected" v-else-if="parsed?.mode === 'live'">Live erkannt</span>
    <span class="detected vod" v-else-if="parsed?.mode === 'vod'">VOD erkannt</span>
    <span class="detected invalid" v-else-if="input.trim()">Ungueltige Eingabe</span>
    <span class="detected invalid" v-if="error">{{ error }}</span>
    <div class="control-row" :class="{ disabled: !canAdd }" @click="canAdd && handleAdd()">
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
