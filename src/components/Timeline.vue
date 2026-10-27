<script setup lang="ts">
import { computed, ref } from 'vue'

export interface TimelineBar {
  id: string
  start: number
  end: number
  color: string
}

const props = defineProps<{
  start: number
  end: number
  position: number
  bars: TimelineBar[]
}>()

const emit = defineEmits<{
  seek: [position: number]
  skip: [seconds: number]
}>()

const trackEl = ref<HTMLElement | null>(null)
const span = computed(() => props.end - props.start)

function pct(ms: number): number {
  return ((ms - props.start) / span.value) * 100
}

function handleClick(evt: MouseEvent) {
  const el = trackEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const ratio = Math.min(Math.max((evt.clientX - rect.left) / rect.width, 0), 1)
  emit('seek', props.start + span.value * ratio)
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' })
}
</script>

<template>
  <div class="timeline">
    <div class="skip-group">
      <button class="skip-btn" title="5 Sekunden zurueck" aria-label="5 Sekunden zurueck" @click="emit('skip', -5)">
        <svg viewBox="0 0 12 12"><polygon points="9,1 3,6 9,11" /></svg>
      </button>
      <button class="skip-btn" title="10 Sekunden zurueck" aria-label="10 Sekunden zurueck" @click="emit('skip', -10)">
        <svg viewBox="0 0 12 12"><polygon points="6,1 0,6 6,11" /><polygon points="12,1 6,6 12,11" /></svg>
      </button>
    </div>
    <div class="track-wrap">
      <div ref="trackEl" class="track" @click="handleClick">
        <div
          v-for="(bar, idx) in bars"
          :key="bar.id"
          class="bar"
          :style="{
            left: pct(bar.start) + '%',
            width: pct(bar.end) - pct(bar.start) + '%',
            top: (idx * 100) / Math.max(bars.length, 1) + '%',
            height: 100 / Math.max(bars.length, 1) + '%',
            background: bar.color,
          }"
        ></div>
        <div class="marker" :style="{ left: pct(position) + '%' }"></div>
      </div>
      <div class="labels">
        <span>{{ formatTime(start) }}</span>
        <span>{{ formatTime(position) }}</span>
        <span>{{ formatTime(end) }}</span>
      </div>
    </div>
    <div class="skip-group">
      <button class="skip-btn" title="10 Sekunden vor" aria-label="10 Sekunden vor" @click="emit('skip', 10)">
        <svg viewBox="0 0 12 12"><polygon points="0,1 6,6 0,11" /><polygon points="6,1 12,6 6,11" /></svg>
      </button>
      <button class="skip-btn" title="5 Sekunden vor" aria-label="5 Sekunden vor" @click="emit('skip', 5)">
        <svg viewBox="0 0 12 12"><polygon points="3,1 9,6 3,11" /></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.timeline {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.skip-group {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.skip-btn {
  width: 32px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
}

.skip-btn:hover {
  background: var(--border);
}

.skip-btn svg {
  width: 12px;
  height: 12px;
  fill: currentColor;
}

.track-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.track {
  position: relative;
  height: 40px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
}

.bar {
  position: absolute;
  opacity: 0.7;
}

.marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--text-primary);
  pointer-events: none;
}

.labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
