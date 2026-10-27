<script setup lang="ts">
import type { TogetherMember } from '../services/streamTogether'

defineProps<{
  members: TogetherMember[]
}>()

const emit = defineEmits<{
  add: [member: TogetherMember]
}>()
</script>

<template>
  <div class="squad-section">
    <h3 class="section-title">Found SquadMembers</h3>
    <div class="squad-grid">
      <button
        v-for="member in members"
        :key="member.login"
        class="squad-box"
        :title="member.displayName"
        :aria-label="member.displayName"
        @click="emit('add', member)"
      >
        <img v-if="member.logo" :src="member.logo" :alt="member.displayName" />
        <span v-else>{{ member.displayName.charAt(0).toUpperCase() }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.squad-section {
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

.squad-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 40px);
  gap: 6px;
}

.squad-box {
  width: 40px;
  height: 40px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

.squad-box:hover {
  border-color: var(--accent);
}

.squad-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
