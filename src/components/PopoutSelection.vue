<script setup lang="ts">
import { ref } from 'vue'
import type { DirectoryItem } from '../services/popoutBridge'

defineProps<{
  items: DirectoryItem[]
}>()

const emit = defineEmits<{
  take: [ids: string[]]
}>()

const selected = ref<string[]>([])

function toggle(id: string) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((x) => x !== id)
    : [...selected.value, id]
}

function submit() {
  if (selected.value.length === 0) return
  emit('take', [...selected.value])
  selected.value = []
}
</script>

<template>
  <div class="popout-select">
    <h3 class="section-title">Streams uebernehmen</h3>
    <p v-if="items.length === 0" class="hint">Keine Streams im Hauptfenster verfuegbar.</p>
    <label v-for="item in items" :key="item.id" class="select-row">
      <input type="checkbox" :checked="selected.includes(item.id)" @change="toggle(item.id)" />
      <span>{{ item.label }}</span>
    </label>
    <button class="take-btn" :disabled="selected.length === 0" @click="submit">Uebernehmen</button>
  </div>
</template>

<style scoped>
.popout-select {
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

.hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.select-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  font-size: 13px;
  cursor: pointer;
}

.select-row input {
  accent-color: var(--accent);
}

.take-btn {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--accent);
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.take-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
