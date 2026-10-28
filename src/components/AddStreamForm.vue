<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
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

const dragActive = ref(false)
const dragTarget = ref(false)
let windowDepth = 0
let sectionDepth = 0

function hasChannelData(e: DragEvent): boolean {
  const types = Array.from(e.dataTransfer?.types ?? [])
  return types.length > 0 && !types.includes('Files')
}

function extractUrl(dt: DataTransfer): string | null {
  const candidates = [
    'text/uri-list',
    'text/x-moz-url',
    'text/x-moz-url-data',
    'text/plain',
    'text/html',
  ]
  for (const type of candidates) {
    const raw = dt.getData(type)
    console.log('[drag] data', type, 'length', raw.length) // DEBUG-TEMP
    if (!raw) continue
    const href = raw.match(/https?:\/\/[^\s"'<>]+/)
    const line = raw
      .split('\n')
      .map((s) => s.trim())
      .find((s) => s.length > 0 && !s.startsWith('#'))
    const found = href?.[0] ?? line
    if (found) return found
  }
  return null
}

function onWindowDragEnter(e: DragEvent) {
  if (!hasChannelData(e)) return
  if (windowDepth === 0) {
    console.log('[drag] types on enter:', Array.from(e.dataTransfer?.types ?? [])) // DEBUG-TEMP
  }
  windowDepth++
  dragActive.value = true
}

function onWindowDragLeave(e: DragEvent) {
  if (!hasChannelData(e)) return
  windowDepth = Math.max(0, windowDepth - 1)
  if (windowDepth === 0) {
    dragActive.value = false
    dragTarget.value = false
  }
}

function onWindowDrop() {
  windowDepth = 0
  sectionDepth = 0
  dragActive.value = false
  dragTarget.value = false
}

function onSectionDragEnter(e: DragEvent) {
  if (!hasChannelData(e)) return
  sectionDepth++
  dragTarget.value = true
}

function onSectionDragLeave(e: DragEvent) {
  if (!hasChannelData(e)) return
  sectionDepth = Math.max(0, sectionDepth - 1)
  if (sectionDepth === 0) dragTarget.value = false
}

function onSectionDragOver(e: DragEvent) {
  if (!hasChannelData(e) || !e.dataTransfer) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
}

function onSectionDrop(e: DragEvent) {
  if (!hasChannelData(e) || !e.dataTransfer) return
  e.preventDefault()
  console.log('[drag] types on drop:', Array.from(e.dataTransfer.types)) // DEBUG-TEMP
  const url = extractUrl(e.dataTransfer)
  console.log('[drag] extracted url:', url) // DEBUG-TEMP
  onWindowDrop()
  if (!url) return
  const result = parseStreamInput(url)
  if (!result) {
    console.log('[drag] url not recognized as Twitch channel or VOD:', url) // DEBUG-TEMP
    return
  }
  emit('add', { channel: result.channel, mode: result.mode, vodId: result.vodId, delay: 0 })
}

onMounted(() => {
  document.addEventListener('dragenter', onWindowDragEnter)
  document.addEventListener('dragleave', onWindowDragLeave)
  document.addEventListener('drop', onWindowDrop)
})

onBeforeUnmount(() => {
  document.removeEventListener('dragenter', onWindowDragEnter)
  document.removeEventListener('dragleave', onWindowDragLeave)
  document.removeEventListener('drop', onWindowDrop)
})
</script>

<template>
  <div
    class="add-stream-form"
    :class="{ 'drag-hint': dragActive && !dragTarget, 'drag-target': dragTarget }"
    @dragenter="onSectionDragEnter"
    @dragleave="onSectionDragLeave"
    @dragover="onSectionDragOver"
    @drop="onSectionDrop"
  >
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
  border-radius: 8px;
  padding: 4px;
  margin: -4px;
  transition: background 0.15s, outline-color 0.15s;
}

.add-stream-form.drag-hint {
  outline: 2px dashed rgba(145, 71, 255, 0.6);
  background: rgba(145, 71, 255, 0.1);
}

.add-stream-form.drag-target {
  outline: 2px solid var(--accent);
  background: rgba(145, 71, 255, 0.25);
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
