<script setup lang="ts">
import { computed } from 'vue'
import { BaseEdge, getBezierPath, getSmoothStepPath } from '@vue-flow/core'
import type { EdgeProps } from '@vue-flow/core'

const props = defineProps<EdgeProps>()

const edgeData = computed(() => (props.data ?? {}) as {
  protocol?: string
  description?: string
  direction?: 'forward' | 'bidirectional' | 'none'
  waypoints?: { x: number; y: number }[]
})

const path = computed(() => {
  const wps = edgeData.value.waypoints
  if (wps && wps.length > 0) {
    // Manual waypoints: polyline
    const points = [
      { x: props.sourceX, y: props.sourceY },
      ...wps,
      { x: props.targetX, y: props.targetY },
    ]
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  }
  // Default: smooth step path
  const [p] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  })
  return p
})

const label = computed(() =>
  [edgeData.value.protocol, edgeData.value.description].filter(Boolean).join(': ')
)

const labelX = computed(() => (props.sourceX + props.targetX) / 2)
const labelY = computed(() => (props.sourceY + props.targetY) / 2)

const markerEnd = computed(() => {
  const dir = edgeData.value.direction ?? 'forward'
  return dir !== 'none' ? 'url(#gs-arrow-end)' : undefined
})

const markerStart = computed(() => {
  return edgeData.value.direction === 'bidirectional' ? 'url(#gs-arrow-start)' : undefined
})
</script>

<template>
  <path
    :d="path"
    fill="none"
    stroke="transparent"
    stroke-width="14"
    style="pointer-events: stroke"
  />
  <path
    :id="id"
    :d="path"
    fill="none"
    :stroke="selected ? 'var(--color-accent)' : 'var(--conn-default)'"
    :stroke-width="selected ? 2.5 : 1.5"
    stroke-linejoin="round"
    style="pointer-events: none"
  />
  <g v-if="label" :transform="`translate(${labelX}, ${labelY})`">
    <rect
      :x="-label.length * 3.2"
      y="-9"
      :width="label.length * 6.4"
      height="15"
      rx="3"
      fill="var(--color-bg-primary)"
      fill-opacity="0.9"
    />
    <text
      text-anchor="middle"
      dominant-baseline="middle"
      font-size="9"
      fill="var(--color-text-muted)"
    >{{ label }}</text>
  </g>
</template>
