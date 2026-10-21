<script setup lang="ts">
defineProps<{
  channels: string[]
  activeChannel: string | null
  width: number
  collapsed: boolean
  keepLoaded: boolean
}>()

const emit = defineEmits<{
  select: [channel: string]
  toggle: []
}>()

const parent = window.location.hostname || 'localhost'

function chatUrl(channel: string): string {
  return `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?parent=${encodeURIComponent(parent)}`
}
</script>

<template>
  <aside class="chat-panel" :style="{ width: collapsed ? '44px' : `${width}px` }">
    <div class="chat-header">
      <button
        class="chat-toggle"
        :title="collapsed ? 'Chat öffnen' : 'Chat schließen'"
        @click="emit('toggle')"
      >
        {{ collapsed ? '\u25C0' : '\u25B6' }}
      </button>
      <div class="chat-tabs" v-show="!collapsed">
        <button
          v-for="channel in channels"
          :key="channel"
          class="chat-tab"
          :class="{ active: channel === activeChannel }"
          @click="emit('select', channel)"
        >
          {{ channel }}
        </button>
      </div>
    </div>
    <div class="chat-frames" v-show="!collapsed">
      <template v-for="channel in channels" :key="channel">
        <iframe
          v-if="keepLoaded || channel === activeChannel"
          v-show="channel === activeChannel"
          class="chat-frame"
          :title="`Chat ${channel}`"
          :src="chatUrl(channel)"
          sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-modals"
        ></iframe>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-width: 0;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border);
  overflow: hidden;
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
}

.chat-toggle {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-tabs {
  display: flex;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
}

.chat-tab {
  flex-shrink: 0;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}

.chat-tab.active {
  color: var(--text-primary);
  border-color: var(--accent);
}

.chat-frames {
  position: relative;
  flex: 1;
  min-height: 0;
}

.chat-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
}
</style>
