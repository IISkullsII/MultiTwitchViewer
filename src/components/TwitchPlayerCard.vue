<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { StreamEntry } from '../types'
import type { TwitchPlayer as TwitchPlayerType } from '../composables/useTwitchEmbed'

const props = defineProps<{
  entry: StreamEntry
  createPlayer: (containerId: string, entry: StreamEntry) => TwitchPlayerType | null
  getPlayer: (id: string) => TwitchPlayerType | undefined
  destroyPlayer: (id: string) => void
}>()

const emit = defineEmits<{
  playerReady: [id: string]
}>()

const containerId = `twitch-player-${props.entry.id}`
const isLoaded = ref(false)

function initPlayer() {
  const player = props.createPlayer(containerId, props.entry)
  if (player) {
    player.addEventListener('ready', () => {
      isLoaded.value = true
      emit('playerReady', props.entry.id)
    })
  }
}

onMounted(() => {
  initPlayer()
})

watch(
  () => props.entry.vodId,
  () => {
    isLoaded.value = false
    initPlayer()
  },
)

onBeforeUnmount(() => {
  props.destroyPlayer(props.entry.id)
})
</script>

<template>
  <div class="player-wrapper" :class="{ 'is-master': entry.isMaster }">
    <div :id="containerId" class="player-container" height="300" width="400"></div>
  </div>
</template>

<style scoped>
.player-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  background: black;
}

.player-wrapper.is-master {
  box-shadow: inset 0 0 0 2px var(--accent);
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
</style>
