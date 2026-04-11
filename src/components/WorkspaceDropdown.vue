<script setup lang="ts">
import { ref, computed } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import ConfirmDialog from './ConfirmDialog.vue'

const store = useWorkspaceStore()
const dropdownRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const showDeleteConfirm = ref(false)
const workspaceToDelete = ref<string | null>(null)

const currentName = computed(() => store.currentWorkspace?.name ?? 'German Shepherd')

onClickOutside(dropdownRef, () => { isOpen.value = false })

function selectWorkspace(id: string) { store.switchWorkspace(id); isOpen.value = false }
function createNew() { store.createWorkspace(); isOpen.value = false }
function confirmDelete(id: string, e: Event) {
  e.stopPropagation()
  workspaceToDelete.value = id
  showDeleteConfirm.value = true
}
function executeDelete() {
  if (workspaceToDelete.value) store.deleteWorkspace(workspaceToDelete.value)
  workspaceToDelete.value = null
}
</script>

<template>
  <div ref="dropdownRef" class="workspace-dropdown">
    <button class="dropdown-toggle" @click="isOpen = !isOpen" title="切換工作區">
      <span class="brand-logo">🐕 {{ currentName }}</span>
      <span class="toggle-arrow" :class="{ open: isOpen }">▾</span>
    </button>

    <Transition name="dropdown">
      <div v-if="isOpen" class="dropdown-menu">
        <div class="workspace-list">
          <div
            v-for="ws in store.workspaces"
            :key="ws.id"
            class="workspace-item"
            :class="{ active: ws.id === store.currentId }"
            @click="selectWorkspace(ws.id)"
          >
            <div class="workspace-info">
              <span class="workspace-name">{{ ws.name }}</span>
              <span class="workspace-meta">{{ new Date(ws.updatedAt).toLocaleDateString('zh-TW') }}</span>
            </div>
            <button
              v-if="store.workspaces.length > 1"
              class="delete-btn"
              @click="confirmDelete(ws.id, $event)"
              title="刪除工作區"
            >🗑️</button>
          </div>
        </div>
        <div class="dropdown-divider"></div>
        <button class="new-workspace-btn" @click="createNew">
          <span>➕</span><span>新增工作區</span>
        </button>
      </div>
    </Transition>

    <ConfirmDialog
      v-model:visible="showDeleteConfirm"
      title="刪除工作區"
      message="確定要刪除此工作區嗎？此操作無法復原。"
      confirm-text="刪除"
      cancel-text="取消"
      :danger="true"
      @confirm="executeDelete"
    />
  </div>
</template>

<style scoped>
.workspace-dropdown { position: relative; }

.dropdown-toggle {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-md);
  transition: background var(--transition-fast);
  color: var(--color-text-primary);
}

.dropdown-toggle:hover { background: var(--color-bg-hover); }

.toggle-arrow {
  color: var(--color-text-muted);
  transition: transform var(--transition-fast);
}
.toggle-arrow.open { transform: rotate(180deg); }

.dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 280px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
  z-index: 1000;
  overflow: hidden;
}

.workspace-list { max-height: 320px; overflow-y: auto; padding: var(--spacing-xs) 0; }

.workspace-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  cursor: pointer;
  transition: background var(--transition-fast);
  gap: var(--spacing-md);
}

.workspace-item:hover { background: var(--color-bg-hover); }
.workspace-item.active {
  background: rgba(59, 130, 246, 0.12);
  border-left: 4px solid var(--color-accent);
  padding-left: calc(var(--spacing-lg) - 4px);
}

.workspace-info { display: flex; flex-direction: column; gap: 2px; flex: 1; overflow: hidden; }
.workspace-name { font-weight: 600; color: var(--color-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.workspace-item.active .workspace-name { color: var(--color-accent); }
.workspace-meta { font-size: var(--font-size-sm); color: var(--color-text-muted); }

.delete-btn {
  width: 32px; height: 32px;
  background: transparent; border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer; opacity: 0.5;
  transition: all var(--transition-fast);
}
.delete-btn:hover { opacity: 1; background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.3); }

.dropdown-divider { height: 1px; background: var(--color-border); margin: var(--spacing-xs) var(--spacing-md); }

.new-workspace-btn {
  display: flex; align-items: center; gap: var(--spacing-sm);
  width: 100%; padding: var(--spacing-md) var(--spacing-lg);
  background: transparent; border: none; cursor: pointer;
  color: var(--color-accent); font-weight: 600;
  transition: background var(--transition-fast);
}
.new-workspace-btn:hover { background: rgba(59, 130, 246, 0.1); }

.dropdown-enter-active, .dropdown-leave-active { transition: all var(--transition-normal); }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
