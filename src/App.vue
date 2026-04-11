<script setup lang="ts">
import { onMounted } from 'vue'
import { useDark } from '@vueuse/core'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import SplitPane from '@/components/SplitPane.vue'
import EditorPanel from '@/components/EditorPanel.vue'
import DiagramPanel from '@/components/DiagramPanel.vue'

useDark({
  selector: 'html',
  attribute: 'data-theme',
  valueDark: 'dark',
  valueLight: 'light',
})

const workspaceStore = useWorkspaceStore()
onMounted(() => workspaceStore.init())
</script>

<template>
  <div class="app-container fade-in">
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

.fade-in {
  animation: fadeIn 0.5s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
