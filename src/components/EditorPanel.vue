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
        <template v-if="!diagramStore.diffMode">
          <button class="btn btn-ghost" @click="diagramStore.enterDiff()" title="Diff 比對">Diff</button>
        </template>
        <template v-else>
          <button class="btn btn-ghost" @click="diagramStore.exitDiff()" title="退出 Diff">Exit</button>
          <button class="btn btn-primary" @click="diagramStore.mergeDiff()" title="合併">Merge</button>
        </template>
      </div>
    </div>
    <div class="panel-content" v-if="!diagramStore.diffMode">
      <TextEditor />
    </div>
    <div class="panel-content diff-content" v-else>
      <div class="diff-pane">
        <div class="diff-label">Original</div>
        <TextEditor v-model="diagramStore.diffUpperText" />
      </div>
      <div class="diff-divider"></div>
      <div class="diff-pane">
        <div class="diff-label">Modified</div>
        <TextEditor v-model="diagramStore.diffLowerText" />
      </div>
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

.diff-content {
  display: flex;
  flex-direction: column;
}

.diff-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.diff-label {
  padding: 2px var(--spacing-md);
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.diff-divider {
  height: 2px;
  background: var(--color-accent);
  flex-shrink: 0;
}
</style>
