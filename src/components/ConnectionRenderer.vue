<script setup lang="ts">
import type { DiagramConnection } from '@/types/index'
import type { NodeRect } from '@/composables/useLayout'

const props = defineProps<{
  connection: DiagramConnection
  fromPos: NodeRect
  toPos: NodeRect
}>()

// Edge midpoints on node borders
function edgePoints(from: NodeRect, to: NodeRect) {
  const fx = from.x + from.w / 2
  const fy = from.y + from.h / 2
  const tx = to.x + to.w / 2
  const ty = to.y + to.h / 2

  // Determine exit/entry sides based on relative position
  const dx = tx - fx
  const dy = ty - fy

  let x1: number, y1: number, x2: number, y2: number

  if (Math.abs(dx) > Math.abs(dy)) {
    // horizontal dominant
    x1 = dx > 0 ? from.x + from.w : from.x
    y1 = fy
    x2 = dx > 0 ? to.x : to.x + to.w
    y2 = ty
  } else {
    // vertical dominant
    x1 = fx
    y1 = dy > 0 ? from.y + from.h : from.y
    x2 = tx
    y2 = dy > 0 ? to.y : to.y + to.h
  }

  // Bezier control points
  const cx1 = x1 + (x2 - x1) * 0.5
  const cy1 = y1
  const cx2 = x1 + (x2 - x1) * 0.5
  const cy2 = y2

  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2

  return { x1, y1, x2, y2, cx1, cy1, cx2, cy2, midX, midY }
}

const pts = edgePoints(props.fromPos, props.toPos)
const label = [props.connection.protocol, props.connection.description].filter(Boolean).join(': ')
</script>

<template>
  <g class="connection-group">
    <path
      :d="`M ${pts.x1} ${pts.y1} C ${pts.cx1} ${pts.cy1}, ${pts.cx2} ${pts.cy2}, ${pts.x2} ${pts.y2}`"
      fill="none"
      stroke="var(--conn-default)"
      stroke-width="1.5"
      :marker-end="connection.direction !== 'none' ? 'url(#arrow-end)' : undefined"
      :marker-start="connection.direction === 'bidirectional' ? 'url(#arrow-start)' : undefined"
    />
    <!-- Label background -->
    <rect
      v-if="label"
      :x="pts.midX - label.length * 3"
      :y="pts.midY - 9"
      :width="label.length * 6"
      height="14"
      rx="3"
      fill="var(--color-bg-primary)"
      fill-opacity="0.85"
    />
    <text
      v-if="label"
      :x="pts.midX"
      :y="pts.midY"
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
