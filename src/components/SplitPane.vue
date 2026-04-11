<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  minLeft?: number
  minRight?: number
  initialRatio?: number
}>()

const containerRef = ref<HTMLElement | null>(null)
const leftWidth = ref(50)
const lastLeftWidth = ref(50)
const isDragging = ref(false)
const collapsed = ref<'left' | 'right' | 'none'>('none')

const minLeft = props.minLeft ?? 300
const minRight = props.minRight ?? 300

onMounted(() => {
  if (props.initialRatio) {
    leftWidth.value = props.initialRatio * 100
    lastLeftWidth.value = leftWidth.value
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})

function onMouseDown(e: MouseEvent) {
  e.preventDefault()
  isDragging.value = true
  if (collapsed.value !== 'none') collapsed.value = 'none'
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value || !containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  let newLeft = e.clientX - rect.left
  if (newLeft < minLeft) newLeft = minLeft
  else if (rect.width - newLeft - 6 < minRight) newLeft = rect.width - minRight - 6
  leftWidth.value = (newLeft / rect.width) * 100
  lastLeftWidth.value = leftWidth.value
}

function onMouseUp() {
  if (isDragging.value) {
    isDragging.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
}

function toggleLeft() {
  if (collapsed.value === 'left') {
    leftWidth.value = lastLeftWidth.value
    collapsed.value = 'none'
  } else {
    if (collapsed.value === 'none') lastLeftWidth.value = leftWidth.value
    leftWidth.value = 0
    collapsed.value = 'left'
  }
}

function toggleRight() {
  if (collapsed.value === 'right') {
    leftWidth.value = lastLeftWidth.value
    collapsed.value = 'none'
  } else {
    if (collapsed.value === 'none') lastLeftWidth.value = leftWidth.value
    leftWidth.value = 100
    collapsed.value = 'right'
  }
}
</script>

<template>
  <div ref="containerRef" class="split-pane-container">
    <div
      class="split-pane-left"
      :style="{ width: `calc(${leftWidth}% - ${collapsed === 'right' ? 0 : 3}px)` }"
      :class="{ 'is-collapsed': collapsed === 'left' }"
    >
      <slot name="left"></slot>
    </div>

    <div
      class="split-pane-resizer"
      :class="{ 'is-dragging': isDragging }"
      @mousedown="onMouseDown"
    >
      <div class="resizer-line"></div>
      <button class="toggle-btn toggle-left" @mousedown.stop @click="toggleLeft"
        :title="collapsed === 'left' ? '展開編輯區' : '收縮編輯區'">
        <span class="arrow">{{ collapsed === 'left' ? '›' : '‹' }}</span>
      </button>
      <button class="toggle-btn toggle-right" @mousedown.stop @click="toggleRight"
        :title="collapsed === 'right' ? '展開檢視區' : '收縮檢視區'">
        <span class="arrow">{{ collapsed === 'right' ? '‹' : '›' }}</span>
      </button>
    </div>

    <div
      class="split-pane-right"
      :style="{ width: `calc(${100 - leftWidth}% - ${collapsed === 'left' ? 0 : 3}px)` }"
      :class="{ 'is-collapsed': collapsed === 'right' }"
    >
      <slot name="right"></slot>
    </div>
  </div>
</template>

<style scoped>
.split-pane-container {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.split-pane-left,
.split-pane-right {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.split-pane-left.is-collapsed,
.split-pane-right.is-collapsed {
  min-width: 0 !important;
  width: 0 !important;
  overflow: hidden !important;
}

.split-pane-resizer {
  flex-shrink: 0;
  width: 12px;
  margin: 0 -3px;
  z-index: 10;
  cursor: col-resize;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
}

.resizer-line {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  transform: translateX(-50%);
  background: var(--color-border);
  transition: all var(--transition-fast);
  z-index: -1;
}

.split-pane-resizer:hover .resizer-line,
.split-pane-resizer.is-dragging .resizer-line {
  background: var(--color-accent);
  width: 4px;
}

.toggle-btn {
  width: 16px;
  height: 24px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 12px;
  padding: 0;
  transition: all var(--transition-fast);
  z-index: 20;
}

.toggle-btn:hover {
  background: var(--color-accent);
  color: white;
  border-color: var(--color-accent);
}

.arrow {
  margin-top: -2px;
  font-weight: bold;
}
</style>
