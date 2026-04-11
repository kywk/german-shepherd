<script setup lang="ts">
import { onMounted } from 'vue'
import { usePreferredDark } from '@vueuse/core'
import { watchEffect } from 'vue'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import SplitPane from '@/components/SplitPane.vue'
import EditorPanel from '@/components/EditorPanel.vue'

const prefersDark = usePreferredDark()
watchEffect(() => {
  document.documentElement.setAttribute('data-theme', prefersDark.value ? 'dark' : 'light')
})

const workspaceStore = useWorkspaceStore()
onMounted(() => workspaceStore.init())
</script>

<template>
  <div class="app-container">
    <SplitPane :initial-ratio="0.35" :min-left="320" :min-right="400">
      <template #left>
        <EditorPanel />
      </template>
      <template #right>
        <div class="panel diagram-placeholder">
          <div class="panel-header">
            <span class="brand-logo">
              <i class="fa-solid fa-diagram-project"></i>
              German Shepherd
            </span>
          </div>
          <div class="panel-content placeholder-content">
            <p>🐕 Diagram renderer (Agent D)</p>
          </div>
        </div>
      </template>
    </SplitPane>
  </div>
</template>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.diagram-placeholder {
  height: 100%;
}

.placeholder-content {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 1.2rem;
}
</style>
