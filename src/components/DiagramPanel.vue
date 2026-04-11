<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDiagramStore } from '@/stores/diagramStore'
import DiagramRenderer from './DiagramRenderer.vue'

const diagramStore = useDiagramStore()

// View overrides (don't modify raw text)
const displayOverride = ref<'LR' | 'TD' | null>(null)
const themeOverride = ref<'simple' | 'icon' | 'image' | null>(null)
const isDark = ref(document.documentElement.getAttribute('data-theme') !== 'light')

const display = computed(() => displayOverride.value ?? diagramStore.parsedDiagram.meta.display)
const theme = computed(() => themeOverride.value ?? diagramStore.parsedDiagram.meta.theme)
const title = computed(() => diagramStore.parsedDiagram.meta.title || 'German Shepherd')

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
}
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
          @click="toggleTheme"
          :title="isDark ? '切換淺色主題' : '切換深色主題'"
        >
          <i :class="isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon'"></i>
        </button>
      </div>
    </div>

    <div class="panel-content">
      <DiagramRenderer
        :diagram="diagramStore.parsedDiagram"
        :theme="theme"
        :display="display"
        :show-tags="diagramStore.showTags"
        :lint-diagnostics="diagramStore.filteredDiagnostics"
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
