<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useDiagramStore } from '@/stores/diagramStore'

const props = defineProps<{ modelValue?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const workspaceStore = useWorkspaceStore()
const diagramStore = useDiagramStore()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const gutterRef = ref<HTMLElement | null>(null)

const isControlled = computed(() => props.modelValue !== undefined)
const localText = ref(isControlled.value ? props.modelValue! : workspaceStore.currentRawText)

// Sync from external source
watch(() => props.modelValue, (val) => {
  if (val !== undefined && val !== localText.value) localText.value = val
})
watch(() => workspaceStore.currentRawText, (val) => {
  if (!isControlled.value && val !== localText.value) localText.value = val
})

function setText(val: string) {
  localText.value = val
  if (isControlled.value) emit('update:modelValue', val)
  else workspaceStore.updateCurrentRawText(val)
}

function onInput(e: Event) {
  setText((e.target as HTMLTextAreaElement).value)
}

function onBlur() {
  if (!isControlled.value) workspaceStore.updateCurrentRawText(localText.value)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    e.preventDefault()
    const ta = e.target as HTMLTextAreaElement
    const start = ta.selectionStart
    const end = ta.selectionEnd
    localText.value = localText.value.slice(0, start) + '  ' + localText.value.slice(end)
    // Restore cursor after Vue updates DOM
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + 2
    })
    setText(localText.value)
  }
}

function onScroll() {
  if (gutterRef.value && textareaRef.value) {
    gutterRef.value.scrollTop = textareaRef.value.scrollTop
  }
}

const lines = computed(() => localText.value.split('\n'))

// Build a map: lineNumber (1-indexed) → worst severity
const lintLineMap = computed(() => {
  const map = new Map<number, 'error' | 'warning' | 'info'>()
  for (const d of diagramStore.filteredDiagnostics) {
    const cur = map.get(d.line)
    if (!cur || (d.severity === 'error') || (d.severity === 'warning' && cur === 'info')) {
      map.set(d.line, d.severity)
    }
  }
  return map
})

// Tooltip messages per line
const lintMessages = computed(() => {
  const map = new Map<number, string[]>()
  for (const d of diagramStore.filteredDiagnostics) {
    if (!map.has(d.line)) map.set(d.line, [])
    map.get(d.line)!.push(d.message)
  }
  return map
})
</script>

<template>
  <div class="text-editor">
    <div ref="gutterRef" class="line-gutter" aria-hidden="true">
      <div
        v-for="(_, i) in lines"
        :key="i"
        class="line-number"
        :class="lintLineMap.get(i + 1)"
        :title="lintMessages.get(i + 1)?.join('\n')"
      >{{ i + 1 }}</div>
    </div>
    <textarea
      ref="textareaRef"
      :value="localText"
      class="editor-textarea"
      spellcheck="false"
      placeholder="輸入架構圖 DSL..."
      @input="onInput"
      @blur="onBlur"
      @keydown="onKeydown"
      @scroll="onScroll"
    ></textarea>
  </div>
</template>

<style scoped>
.text-editor {
  display: flex;
  height: 100%;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.8;
}

.line-gutter {
  flex-shrink: 0;
  width: 44px;
  overflow: hidden;
  background: var(--color-bg-tertiary);
  border-right: 1px solid var(--color-border);
  padding-top: 8px;
  user-select: none;
}

.line-number {
  line-height: calc(13px * 1.8);
  text-align: right;
  padding-right: 8px;
  color: var(--color-text-muted);
  font-size: 13px;
  cursor: default;
}

.line-number.error {
  background: rgba(var(--lint-error-rgb, 239, 68, 68), 0.25);
  color: var(--lint-error);
}

.line-number.warning {
  background: rgba(var(--lint-warning-rgb, 234, 179, 8), 0.25);
  color: var(--lint-warning);
}

.line-number.info {
  background: rgba(59, 130, 246, 0.15);
  color: var(--lint-info);
}

.editor-textarea {
  flex: 1;
  resize: none;
  border: none;
  outline: none;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.8;
  padding: 8px 12px;
  tab-size: 2;
  overflow-y: scroll;
}

.editor-textarea::placeholder {
  color: var(--color-text-muted);
  opacity: 0.6;
}
</style>
