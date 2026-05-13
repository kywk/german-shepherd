<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useDiagramStore } from '@/stores/diagramStore'
import { useCanvasStore } from '@/stores/canvasStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useDark, useToggle, useDebounceFn } from '@vueuse/core'
import FlowDiagramRenderer from './FlowDiagramRenderer.vue'

const diagramStore = useDiagramStore()
const canvasStore = useCanvasStore()
const workspaceStore = useWorkspaceStore()

// Sync layout when markdown text changes (from left panel editing)
const debouncedSync = useDebounceFn(() => canvasStore.syncLayoutWithDiagram(), 500)
watch(() => workspaceStore.currentRawText, () => {
  if (canvasStore.isManualMode) debouncedSync()
})

// View overrides (don't modify raw text)
const displayOverride = ref<'LR' | 'TD' | null>(null)
const themeOverride = ref<'simple' | 'icon' | 'image' | null>(null)

const isDark = useDark({
  selector: 'html',
  attribute: 'data-theme',
  valueDark: 'dark',
  valueLight: 'light',
})
const toggleTheme = useToggle(isDark)

const display = computed(() => displayOverride.value ?? diagramStore.parsedDiagram.meta.display)
const theme = computed(() => themeOverride.value ?? diagramStore.parsedDiagram.meta.theme)
const title = computed(() => diagramStore.parsedDiagram.meta.title || 'German Shepherd')

const activeDiagram = computed(() =>
  diagramStore.diffMode && diagramStore.diffResult
    ? diagramStore.diffResult.mergedDiagram
    : diagramStore.parsedDiagram
)

// Keyboard shortcuts
function onKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault()
    if (e.shiftKey) canvasStore.redo()
    else canvasStore.undo()
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (canvasStore.selectedConnectionIndex !== null) {
      canvasStore.removeConnection(canvasStore.selectedConnectionIndex)
    }
  }
}

onMounted(() => {
  canvasStore.initUndo()
  window.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div class="panel diagram-panel">
    <div class="panel-header">
      <div class="header-left">
        <span class="brand-logo">
          <i class="fa-solid fa-diagram-project"></i>
          {{ title }}
        </span>
      </div>
      <div class="header-right">
        <!-- Manual mode toggle -->
        <button
          v-if="!canvasStore.isManualMode"
          class="btn btn-ghost"
          @click="canvasStore.enterManualMode()"
          title="切換手動編輯模式"
        ><i class="fa-solid fa-hand"></i></button>
        <button
          v-else
          class="btn btn-primary"
          @click="canvasStore.exitManualMode()"
          title="退出手動模式（回到自動 layout）"
        ><i class="fa-solid fa-wand-magic-sparkles"></i> Auto</button>

        <!-- Reset layout -->
        <button
          class="btn btn-ghost"
          @click="canvasStore.resetLayout()"
          title="重置手動佈局"
        ><i class="fa-solid fa-arrows-rotate"></i></button>

        <!-- Undo/Redo -->
        <button
          class="btn btn-ghost"
          :disabled="!canvasStore.canUndo"
          @click="canvasStore.undo()"
          title="Undo (Ctrl+Z)"
        ><i class="fa-solid fa-rotate-left"></i></button>
        <button
          class="btn btn-ghost"
          :disabled="!canvasStore.canRedo"
          @click="canvasStore.redo()"
          title="Redo (Ctrl+Shift+Z)"
        ><i class="fa-solid fa-rotate-right"></i></button>

        <!-- Display toggle -->
        <div class="toggle-group" role="group" aria-label="佈局方向">
          <button
            class="btn btn-ghost"
            :class="{ active: display === 'LR' }"
            @click="displayOverride = 'LR'"
            title="左右佈局"
          >LR</button>
          <button
            class="btn btn-ghost"
            :class="{ active: display === 'TD' }"
            @click="displayOverride = 'TD'"
            title="上下佈局"
          >TD</button>
        </div>

        <!-- Theme toggle -->
        <div class="toggle-group" role="group" aria-label="節點主題">
          <button
            class="btn btn-ghost"
            :class="{ active: theme === 'simple' }"
            @click="themeOverride = 'simple'"
            title="簡單主題"
          >簡</button>
          <button
            class="btn btn-ghost"
            :class="{ active: theme === 'icon' }"
            @click="themeOverride = 'icon'"
            title="圖示主題"
          >圖</button>
        </div>

        <!-- Tags toggle -->
        <button
          class="btn btn-ghost"
          :class="{ active: diagramStore.showTags }"
          @click="diagramStore.showTags = !diagramStore.showTags"
          title="顯示/隱藏標籤"
        >#</button>

        <!-- Dark/light toggle -->
        <button
          class="btn btn-ghost theme-toggle"
          @click="toggleTheme()"
          :title="isDark ? '切換淺色主題' : '切換深色主題'"
        >
          <i :class="isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon'"></i>
        </button>
      </div>
    </div>

    <div class="panel-content">
      <FlowDiagramRenderer
        :diagram="activeDiagram"
        :theme="theme"
        :display="display"
        :show-tags="diagramStore.showTags"
        :lint-diagnostics="diagramStore.filteredDiagnostics"
        :node-diff-map="diagramStore.diffResult?.nodeDiffMap"
        :is-manual-mode="canvasStore.isManualMode"
      />
    </div>
  </div>
</template>

<style scoped>
.diagram-panel { height: 100%; min-width: 400px; }

.panel-header { gap: var(--spacing-md); }

.header-left {
  display: flex;
  align-items: center;
  overflow: hidden;
}

.header-left .brand-logo {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-shrink: 0;
}

.panel-content {
  padding: 0;
  overflow: hidden;
}
</style>
