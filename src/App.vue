<script setup lang="ts">
import { onMounted } from 'vue'
import { usePreferredDark } from '@vueuse/core'
import { watchEffect } from 'vue'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import SplitPane from '@/components/SplitPane.vue'
import EditorPanel from '@/components/EditorPanel.vue'
import DiagramPanel from '@/components/DiagramPanel.vue'

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
        <DiagramPanel />
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
</style>
