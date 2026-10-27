<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import type { StreamEntry } from '../types'
import type { TwitchPlayer as TwitchPlayerType } from '../composables/useTwitchEmbed'

const props = defineProps<{
  entry: StreamEntry
  createPlayer: (containerId: string, entry: StreamEntry) => TwitchPlayerType | null
  destroyPlayer: (id: string) => void
}>()

const emit = defineEmits<{
  playerReady: [id: string]
}>()

const containerId = `twitch-player-${props.entry.id}`
const hasError = ref(false)

function initPlayer() {
  const player = props.createPlayer(containerId, props.entry)
  if (!player) {
    hasError.value = true
    return
  }
  player.addEventListener('ready', () => {
    emit('playerReady', props.entry.id)
  })
}

onMounted(() => {
  initPlayer()
})

onBeforeUnmount(() => {
  props.destroyPlayer(props.entry.id)
})
</script>

<template>
  <div class="player-wrapper">
    <div :id="containerId" class="player-container" height="300" width="400"></div>
    <div v-if="hasError" class="player-error">Player konnte nicht geladen werden</div>
  </div>
</template>

<style scoped>
.player-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  background: black;
}

.player-container {
  width: 100%;
  height: 100%;
}

.player-container :deep(iframe) {
  width: 100%;
  height: 100%;
  border: none;
}

.player-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
