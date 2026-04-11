<script setup lang="ts">
import { computed } from 'vue'
import type { DiagramConnection } from '@/types/index'
import type { NodeRect } from '@/composables/useLayout'

const props = defineProps<{
  connection: DiagramConnection
  fromPos: NodeRect
  toPos: NodeRect
  allNodeRects?: Map<string, NodeRect>
}>()

const OFFSET = 20 // routing offset from node edge

/**
 * Manhattan routing: orthogonal path with a single bend channel
 * that runs outside both nodes to avoid overlap.
 */
const route = computed(() => {
  const from = props.fromPos
  const to = props.toPos
  if (!from.w || !to.w) return null

  const fcx = from.x + from.w / 2
  const fcy = from.y + from.h / 2
  const tcx = to.x + to.w / 2
  const tcy = to.y + to.h / 2

  const dx = tcx - fcx
  const dy = tcy - fcy

  let x1: number, y1: number, x2: number, y2: number
  let path: string

  if (Math.abs(dx) >= Math.abs(dy)) {
    // Horizontal dominant: exit left/right side
    const goRight = dx > 0
    x1 = goRight ? from.x + from.w : from.x
    y1 = fcy
    x2 = goRight ? to.x : to.x + to.w
    y2 = tcy

    if (Math.abs(y2 - y1) < 2) {
      // Nearly same Y: straight horizontal
      path = `M ${x1} ${y1} L ${x2} ${y2}`
    } else {
      // Route: horizontal → vertical → horizontal
      const midX = (x1 + x2) / 2
      path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`
    }
  } else {
    // Vertical dominant: exit top/bottom side
    const goDown = dy > 0
    x1 = fcx
    y1 = goDown ? from.y + from.h : from.y
    x2 = tcx
    y2 = goDown ? to.y : to.y + to.h

    if (Math.abs(x2 - x1) < 2) {
      // Nearly same X: straight vertical
      path = `M ${x1} ${y1} L ${x2} ${y2}`
    } else {
      // Route: vertical → horizontal → vertical
      const midY = (y1 + y2) / 2
      path = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`
    }
  }

  // Check if the mid-segment overlaps any node; if so, reroute around
  // Simple heuristic: if midpoint of path is inside a node, shift the channel
  if (props.allNodeRects) {
    const midX = (x1 + x2) / 2
    const midY = (y1 + y2) / 2
    for (const [name, nr] of props.allNodeRects) {
      if (name === props.connection.from || name === props.connection.to) continue
      if (midX > nr.x - 4 && midX < nr.x + nr.w + 4 &&
          midY > nr.y - 4 && midY < nr.y + nr.h + 4) {
        // Reroute: go around the blocking node
        if (Math.abs(dx) >= Math.abs(dy)) {
          const shiftY = fcy < nr.y + nr.h / 2 ? nr.y - OFFSET : nr.y + nr.h + OFFSET
          path = `M ${x1} ${y1} L ${x1 + (x2 > x1 ? OFFSET : -OFFSET)} ${y1} L ${x1 + (x2 > x1 ? OFFSET : -OFFSET)} ${shiftY} L ${x2 + (x2 > x1 ? -OFFSET : OFFSET)} ${shiftY} L ${x2 + (x2 > x1 ? -OFFSET : OFFSET)} ${y2} L ${x2} ${y2}`
        } else {
          const shiftX = fcx < nr.x + nr.w / 2 ? nr.x - OFFSET : nr.x + nr.w + OFFSET
          path = `M ${x1} ${y1} L ${x1} ${y1 + (y2 > y1 ? OFFSET : -OFFSET)} L ${shiftX} ${y1 + (y2 > y1 ? OFFSET : -OFFSET)} L ${shiftX} ${y2 + (y2 > y1 ? -OFFSET : OFFSET)} L ${x2} ${y2 + (y2 > y1 ? -OFFSET : OFFSET)} L ${x2} ${y2}`
        }
        break
      }
    }
  }

  const labelX = (x1 + x2) / 2
  const labelY = (y1 + y2) / 2

  return { path, labelX, labelY }
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
