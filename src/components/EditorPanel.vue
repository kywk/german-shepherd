<script setup lang="ts">
import { useDiagramStore } from '@/stores/diagramStore'
import WorkspaceDropdown from './WorkspaceDropdown.vue'
import TextEditor from './TextEditor.vue'

const diagramStore = useDiagramStore()
</script>

<template>
  <div class="panel editor-panel">
    <div class="panel-header">
      <div class="header-left">
        <WorkspaceDropdown />
      </div>
      <div class="header-right">
        <label class="lint-toggle btn btn-ghost" title="開關 Lint 檢查">
          <input type="checkbox" v-model="diagramStore.lintEnabled" />
          <span>Lint</span>
        </label>
      </div>
    </div>
    <div class="panel-content">
      <TextEditor />
    </div>
  </div>
</template>

<style scoped>
.editor-panel { min-width: 320px; }

.panel-header { gap: var(--spacing-md); }

.header-left, .header-right {
  display: flex;
  align-items: center;
}

.header-right { gap: var(--spacing-sm); }

.lint-toggle {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  cursor: pointer;
  user-select: none;
}

.lint-toggle input[type="checkbox"] {
  accent-color: var(--color-accent);
  width: 14px;
  height: 14px;
}
</style>
