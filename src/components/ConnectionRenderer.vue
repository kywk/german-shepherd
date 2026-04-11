<script setup lang="ts">
import { computed } from 'vue'
import type { DiagramConnection } from '@/types/index'
import type { NodeRect } from '@/composables/useLayout'

const props = defineProps<{
  connection: DiagramConnection
  fromPort: { x: number; y: number }
  toPort: { x: number; y: number }
  fromSide: 'top' | 'bottom' | 'left' | 'right'
  allNodeRects?: Map<string, NodeRect>
}>()

const MARGIN = 12 // clearance from node edges

/**
 * Find a corridor value (X for horizontal routing, Y for vertical)
 * that doesn't pass through any node rect.
 * Tries midpoint first, then scans for a clear gap.
 */
function findClearCorridor(
  axis: 'x' | 'y',
  corridorMin: number, corridorMax: number,
  fixedMin: number, fixedMax: number, // the perpendicular range the corridor must clear
  preferred: number
): number {
  if (!props.allNodeRects) return preferred

  const fromName = props.connection.from
  const toName = props.connection.to

  function blocked(val: number): boolean {
    for (const [name, r] of props.allNodeRects!) {
      if (name === fromName || name === toName) continue
      if (axis === 'x') {
        // corridor is a vertical line at x=val, spanning fixedMin..fixedMax
        if (val > r.x - MARGIN && val < r.x + r.w + MARGIN &&
            fixedMax > r.y - MARGIN && fixedMin < r.y + r.h + MARGIN) return true
      } else {
        // corridor is a horizontal line at y=val, spanning fixedMin..fixedMax
        if (val > r.y - MARGIN && val < r.y + r.h + MARGIN &&
            fixedMax > r.x - MARGIN && fixedMin < r.x + r.w + MARGIN) return true
      }
    }
    return false
  }

  if (!blocked(preferred)) return preferred

  // Scan candidate positions: node edges ± MARGIN within the corridor range
  const candidates: number[] = []
  for (const [name, r] of props.allNodeRects!) {
    if (name === fromName || name === toName) continue
    const lo = axis === 'x' ? r.x - MARGIN : r.y - MARGIN
    const hi = axis === 'x' ? r.x + r.w + MARGIN : r.y + r.h + MARGIN
    if (lo >= corridorMin && lo <= corridorMax) candidates.push(lo)
    if (hi >= corridorMin && hi <= corridorMax) candidates.push(hi)
  }
  candidates.push(corridorMin, corridorMax)
  candidates.sort((a, b) => a - b)

  // Pick the candidate closest to preferred that is clear
  candidates.sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred))
  for (const c of candidates) {
    if (!blocked(c)) return c
  }
  return preferred
}

const route = computed(() => {
  const { x: x1, y: y1 } = props.fromPort
  const { x: x2, y: y2 } = props.toPort
  if (x1 === 0 && y1 === 0 && x2 === 0 && y2 === 0) return null

  const horizontal = props.fromSide === 'left' || props.fromSide === 'right'
  let path: string

  if (horizontal) {
    if (Math.abs(y2 - y1) < 2) {
      path = `M ${x1} ${y1} L ${x2} ${y2}`
    } else {
      const midX = findClearCorridor(
        'x',
        Math.min(x1, x2), Math.max(x1, x2),
        Math.min(y1, y2), Math.max(y1, y2),
        (x1 + x2) / 2
      )
      path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`
    }
  } else {
    if (Math.abs(x2 - x1) < 2) {
      path = `M ${x1} ${y1} L ${x2} ${y2}`
    } else {
      const midY = findClearCorridor(
        'y',
        Math.min(y1, y2), Math.max(y1, y2),
        Math.min(x1, x2), Math.max(x1, x2),
        (y1 + y2) / 2
      )
      path = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`
    }
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
