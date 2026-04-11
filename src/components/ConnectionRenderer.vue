<script setup lang="ts">
import { computed } from 'vue'
import type { DiagramConnection } from '@/types/index'

const props = defineProps<{
  connection: DiagramConnection
  fromPort: { x: number; y: number }
  toPort: { x: number; y: number }
}>()

const route = computed(() => {
  const { x: x1, y: y1 } = props.fromPort
  const { x: x2, y: y2 } = props.toPort
  if (x1 === 0 && y1 === 0 && x2 === 0 && y2 === 0) return null

  const dx = Math.abs(x2 - x1)
  const dy = Math.abs(y2 - y1)
  let path: string

  if (dx < 2 && dy < 2) {
    path = `M ${x1} ${y1} L ${x2} ${y2}`
  } else if (dy < 2) {
    // Straight horizontal
    path = `M ${x1} ${y1} L ${x2} ${y2}`
  } else if (dx < 2) {
    // Straight vertical
    path = `M ${x1} ${y1} L ${x2} ${y2}`
  } else if (dx >= dy) {
    // Horizontal dominant: H → V → H
    const midX = (x1 + x2) / 2
    path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`
  } else {
    // Vertical dominant: V → H → V
    const midY = (y1 + y2) / 2
    path = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`
  }

  return { path, labelX: (x1 + x2) / 2, labelY: (y1 + y2) / 2 }
})

const label = computed(() =>
  [props.connection.protocol, props.connection.description].filter(Boolean).join(': ')
)
</script>

<template>
  <g v-if="route" class="connection-group">
    <path
      :d="route.path"
      fill="none"
      stroke="var(--conn-default)"
      stroke-width="1.5"
      stroke-linejoin="round"
      :marker-end="connection.direction !== 'none' ? 'url(#arrow-end)' : undefined"
      :marker-start="connection.direction === 'bidirectional' ? 'url(#arrow-start)' : undefined"
    />
    <rect
      v-if="label"
      :x="route.labelX - label.length * 3.2"
      :y="route.labelY - 9"
      :width="label.length * 6.4"
      height="15"
      rx="3"
      fill="var(--color-bg-primary)"
      fill-opacity="0.9"
    />
    <text
      v-if="label"
      :x="route.labelX"
      :y="route.labelY"
      text-anchor="middle"
      dominant-baseline="middle"
      font-size="9"
      fill="var(--color-text-muted)"
    >{{ label }}</text>
  </g>
</template>

<style scoped>
.connection-group { cursor: pointer; }
.connection-group:hover path { stroke: var(--conn-highlight); stroke-width: 2.5; }
.connection-group:hover text { fill: var(--color-text-primary); }
</style>
