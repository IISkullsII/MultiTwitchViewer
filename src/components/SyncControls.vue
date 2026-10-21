<script setup lang="ts">
const emit = defineEmits<{
  sync: []
  recordOffsets: []
}>()
</script>

<template>
  <div class="sync-section">
    <h3 class="section-title">Synchronisation</h3>
    <div class="control-row" @click="emit('recordOffsets')">
      <span>Verschiebung speichern</span>
      <span class="symbol">&#9670;</span>
    </div>
    <div class="control-row" @click="emit('sync')">
      <span>Synchronisieren</span>
      <span class="symbol">&#8635;</span>
    </div>
  </div>
</template>

<style scoped>
.sync-section {
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
  font-size: 14px;
  opacity: 0.7;
}
</style>
