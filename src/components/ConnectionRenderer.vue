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

const GAP = 14 // clearance from node edges

/**
 * For H→V→H routing (left/right exits):
 *   path = x1→midX (at y1), midX (y1→y2), midX→x2 (at y2)
 *   The vertical segment at x=midX spans y1..y2.
 *   We need midX to not intersect any node in that Y band.
 *
 * Strategy: collect all "forbidden X intervals" from nodes that overlap the Y band,
 * then find the gap closest to the midpoint.
 */
function findClearX(x1: number, y1: number, x2: number, y2: number): number {
  const preferred = (x1 + x2) / 2
  if (!props.allNodeRects) return preferred

  const yLo = Math.min(y1, y2)
  const yHi = Math.max(y1, y2)
  const fromName = props.connection.from
  const toName = props.connection.to

  // Collect forbidden X intervals: nodes whose Y range overlaps [yLo, yHi]
  const forbidden: [number, number][] = []
  for (const [name, r] of props.allNodeRects) {
    if (name === fromName || name === toName) continue
    if (r.y + r.h + GAP < yLo || r.y - GAP > yHi) continue // no Y overlap
    forbidden.push([r.x - GAP, r.x + r.w + GAP])
  }

  if (forbidden.length === 0) return preferred

  // Merge forbidden intervals
  forbidden.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const iv of forbidden) {
    if (merged.length && iv[0] <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1])
    } else {
      merged.push([...iv])
    }
  }

  // Check if preferred is clear
  function isClear(x: number) {
    return !merged.some(([lo, hi]) => x >= lo && x <= hi)
  }
  if (isClear(preferred)) return preferred

  // Find gaps between forbidden intervals; pick gap midpoint closest to preferred
  const candidates: number[] = []
  // Gap before first interval
  candidates.push(merged[0][0] - GAP)
  // Gaps between intervals
  for (let i = 0; i < merged.length - 1; i++) {
    candidates.push((merged[i][1] + merged[i + 1][0]) / 2)
  }
  // Gap after last interval
  candidates.push(merged[merged.length - 1][1] + GAP)

  candidates.sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred))
  for (const c of candidates) {
    if (isClear(c)) return c
  }
  return preferred
}

/** Same logic for V→H→V routing (top/bottom exits), finding clear Y. */
function findClearY(x1: number, y1: number, x2: number, y2: number): number {
  const preferred = (y1 + y2) / 2
  if (!props.allNodeRects) return preferred

  const xLo = Math.min(x1, x2)
  const xHi = Math.max(x1, x2)
  const fromName = props.connection.from
  const toName = props.connection.to

  const forbidden: [number, number][] = []
  for (const [name, r] of props.allNodeRects) {
    if (name === fromName || name === toName) continue
    if (r.x + r.w + GAP < xLo || r.x - GAP > xHi) continue
    forbidden.push([r.y - GAP, r.y + r.h + GAP])
  }

  if (forbidden.length === 0) return preferred

  forbidden.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const iv of forbidden) {
    if (merged.length && iv[0] <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1])
    } else {
      merged.push([...iv])
    }
  }

  function isClear(y: number) {
    return !merged.some(([lo, hi]) => y >= lo && y <= hi)
  }
  if (isClear(preferred)) return preferred

  const candidates: number[] = []
  candidates.push(merged[0][0] - GAP)
  for (let i = 0; i < merged.length - 1; i++) {
    candidates.push((merged[i][1] + merged[i + 1][0]) / 2)
  }
  candidates.push(merged[merged.length - 1][1] + GAP)

  candidates.sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred))
  for (const c of candidates) {
    if (isClear(c)) return c
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
      const midX = findClearX(x1, y1, x2, y2)
      path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`
    }
  } else {
    if (Math.abs(x2 - x1) < 2) {
      path = `M ${x1} ${y1} L ${x2} ${y2}`
    } else {
      const midY = findClearY(x1, y1, x2, y2)
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
