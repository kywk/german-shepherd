<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
  (e: 'update:visible', value: boolean): void
}>()

const dialogRef = ref<HTMLDialogElement | null>(null)

watch(() => props.visible, (val) => {
  if (val) dialogRef.value?.showModal()
  else dialogRef.value?.close()
})

function onConfirm() { emit('confirm'); emit('update:visible', false) }
function onCancel() { emit('cancel'); emit('update:visible', false) }
function onBackdropClick(e: MouseEvent) { if (e.target === dialogRef.value) onCancel() }
</script>

<template>
  <dialog ref="dialogRef" class="confirm-dialog" @click="onBackdropClick">
    <div class="dialog-content">
      <h3 class="dialog-title">{{ title }}</h3>
      <p class="dialog-message">{{ message }}</p>
      <div class="dialog-actions">
        <button class="btn btn-ghost" @click="onCancel">{{ cancelText ?? '取消' }}</button>
        <button class="btn" :class="danger ? 'btn-danger' : 'btn-primary'" @click="onConfirm">
          {{ confirmText ?? '確認' }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.confirm-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border: none;
  border-radius: var(--radius-xl);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  padding: 0;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--glass-border);
  max-width: 420px;
  width: 90%;
  margin: 0;
}

.confirm-dialog::backdrop {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
}

.dialog-content { padding: var(--spacing-xl); }

.dialog-title {
  margin: 0 0 var(--spacing-md);
  font-size: 1.25rem;
  font-weight: 700;
}

.dialog-message {
  margin: 0 0 var(--spacing-xl);
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.dialog-actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: flex-end;
}

.btn-danger {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.btn-danger:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
}
</style>
