<script setup lang="ts">
import { computed, ref } from 'vue'
import { getSmoothStepPath, useVueFlow } from '@vue-flow/core'
import type { EdgeProps } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvasStore'

const props = defineProps<EdgeProps>()
const canvasStore = useCanvasStore()
const { viewport } = useVueFlow()

const SNAP = 5

const edgeData = computed(() => (props.data ?? {}) as {
  protocol?: string
  description?: string
  direction?: 'forward' | 'bidirectional' | 'none'
  waypoints?: { x: number; y: number }[]
})

const waypoints = computed(() => edgeData.value.waypoints ?? [])

// All reference points for snapping (source, target, all waypoints)
const snapTargets = computed(() => {
  const pts: { x: number; y: number }[] = [
    { x: props.sourceX, y: props.sourceY },
    { x: props.targetX, y: props.targetY },
    ...waypoints.value,
  ]
  return pts
})

const path = computed(() => {
  if (waypoints.value.length > 0) {
    const points = [
      { x: props.sourceX, y: props.sourceY },
      ...waypoints.value,
      { x: props.targetX, y: props.targetY },
    ]
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  }
  const [p] = getSmoothStepPath({
    sourceX: props.sourceX, sourceY: props.sourceY, sourcePosition: props.sourcePosition,
    targetX: props.targetX, targetY: props.targetY, targetPosition: props.targetPosition,
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
  return dir !== 'none' ? 'url(#gs-edge-arrow)' : undefined
})
const markerStart = computed(() => {
  return edgeData.value.direction === 'bidirectional' ? 'url(#gs-edge-arrow-start)' : undefined
})

const id = props.id

// Segments between consecutive points (for segment dragging)
const segments = computed(() => {
  if (waypoints.value.length === 0) return []
  const pts = [
    { x: props.sourceX, y: props.sourceY },
    ...waypoints.value,
    { x: props.targetX, y: props.targetY },
  ]
  const segs: { x1: number; y1: number; x2: number; y2: number; idx: number; dir: 'h' | 'v' }[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = Math.abs(pts[i + 1].x - pts[i].x)
    const dy = Math.abs(pts[i + 1].y - pts[i].y)
    // Classify: horizontal if dy < dx, vertical if dx < dy
    const dir = dy < dx ? 'h' : 'v'
    segs.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y, idx: i, dir })
  }
  return segs
})

// Midpoint hint when no waypoints
const midpoint = computed(() => {
  if (waypoints.value.length > 0) return null
  return { x: (props.sourceX + props.targetX) / 2, y: (props.sourceY + props.targetY) / 2 }
})

// Segment midpoints for drag handles
const segMidpoints = computed(() =>
  segments.value.map(s => ({ x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2, dir: s.dir, idx: s.idx }))
)

// ─── Snap guide state ───
const guideX = ref<number | null>(null)
const guideY = ref<number | null>(null)

function snapPoint(x: number, y: number, excludeIdx: number): { x: number; y: number } {
  let gx: number | null = null, gy: number | null = null
  for (let i = 0; i < snapTargets.value.length; i++) {
    if (i - 1 === excludeIdx) continue // skip self (waypoints are at index 1..n in snapTargets)
    const t = snapTargets.value[i]
    if (Math.abs(x - t.x) <= SNAP && (gx === null || Math.abs(x - t.x) < Math.abs(x - gx))) {
      gx = t.x
    }
    if (Math.abs(y - t.y) <= SNAP && (gy === null || Math.abs(y - t.y) < Math.abs(y - gy))) {
      gy = t.y
    }
  }
  guideX.value = gx !== null ? gx : null
  guideY.value = gy !== null ? gy : null
  return { x: gx ?? x, y: gy ?? y }
}

// ─── Layout index lookup ───
function getLayoutIdx(): number {
  const ld = canvasStore.layoutData
  const from = props.source.startsWith('__zone__') ? props.source.replace('__zone__', '') : props.source
  const to = props.target.startsWith('__zone__') ? props.target.replace('__zone__', '') : props.target
  const layoutIdx = ld.connections.findIndex(lc => lc.from === from && lc.to === to)
  if (layoutIdx >= 0) return layoutIdx
  canvasStore.addConnection({ from, to, fromSide: 'right', toSide: 'left', waypoints: [] })
  return ld.connections.length
}

// ─── Waypoint drag ───
const draggingIdx = ref<number | null>(null)

function onWpPointerDown(e: PointerEvent, idx: number) {
  e.stopPropagation(); e.preventDefault()
  draggingIdx.value = idx
  window.addEventListener('pointermove', onWpPointerMove)
  window.addEventListener('pointerup', onWpPointerUp)
}

function onWpPointerMove(e: PointerEvent) {
  if (draggingIdx.value === null) return
  const connIdx = getLayoutIdx()
  const conn = canvasStore.layoutData.connections[connIdx]
  if (!conn) return
  const wps = [...conn.waypoints]
  const raw = {
    x: wps[draggingIdx.value].x + e.movementX / viewport.value.zoom,
    y: wps[draggingIdx.value].y + e.movementY / viewport.value.zoom,
  }
  wps[draggingIdx.value] = snapPoint(raw.x, raw.y, draggingIdx.value)
  canvasStore.updateConnectionWaypoints(connIdx, wps)
}

function onWpPointerUp() {
  draggingIdx.value = null
  guideX.value = null; guideY.value = null
  window.removeEventListener('pointermove', onWpPointerMove)
  window.removeEventListener('pointerup', onWpPointerUp)
}

// ─── Segment drag ───
const draggingSeg = ref<{ idx: number; dir: 'h' | 'v' } | null>(null)

function onSegPointerDown(e: PointerEvent, segIdx: number, dir: 'h' | 'v') {
  e.stopPropagation(); e.preventDefault()
  draggingSeg.value = { idx: segIdx, dir }
  window.addEventListener('pointermove', onSegPointerMove)
  window.addEventListener('pointerup', onSegPointerUp)
}

function onSegPointerMove(e: PointerEvent) {
  if (!draggingSeg.value) return
  const { idx, dir } = draggingSeg.value
  const connIdx = getLayoutIdx()
  const ld = canvasStore.layoutData
  const conn = ld.connections[connIdx]
  if (!conn) return
  const wps = [...conn.waypoints]
  const delta = dir === 'h'
    ? e.movementY / viewport.value.zoom
    : e.movementX / viewport.value.zoom

  const wpStart = idx - 1
  const wpEnd = idx

  if (dir === 'h') {
    if (wpStart >= 0 && wpStart < wps.length) wps[wpStart] = { ...wps[wpStart], y: wps[wpStart].y + delta }
    if (wpEnd >= 0 && wpEnd < wps.length) wps[wpEnd] = { ...wps[wpEnd], y: wps[wpEnd].y + delta }
  } else {
    if (wpStart >= 0 && wpStart < wps.length) wps[wpStart] = { ...wps[wpStart], x: wps[wpStart].x + delta }
    if (wpEnd >= 0 && wpEnd < wps.length) wps[wpEnd] = { ...wps[wpEnd], x: wps[wpEnd].x + delta }
  }

  canvasStore.updateConnectionWaypoints(connIdx, wps)
}

function onSegPointerUp() {
  draggingSeg.value = null
  window.removeEventListener('pointermove', onSegPointerMove)
  window.removeEventListener('pointerup', onSegPointerUp)
}

// ─── Initial segment drag ───

// Initial segment direction (based on source→target)
const initSegDir = computed(() => {
  const dx = Math.abs(props.targetX - props.sourceX)
  const dy = Math.abs(props.targetY - props.sourceY)
  return dx >= dy ? 'h' : 'v'
})

// Drag the initial midpoint handle → create 2 waypoints forming an orthogonal bend
function onInitSegDown(e: PointerEvent) {
  e.stopPropagation(); e.preventDefault()
  const mid = midpoint.value
  if (!mid) return
  const dir = initSegDir.value
  // Create two waypoints: one stays at source-side, one at target-side
  // For horizontal edge (LR): wp0 at (midX, sourceY), wp1 at (midX, targetY)
  // For vertical edge (TD): wp0 at (sourceX, midY), wp1 at (targetX, midY)
  let wps: { x: number; y: number }[]
  if (dir === 'h') {
    wps = [{ x: mid.x, y: props.sourceY }, { x: mid.x, y: props.targetY }]
  } else {
    wps = [{ x: props.sourceX, y: mid.y }, { x: props.targetX, y: mid.y }]
  }
  canvasStore.updateConnectionWaypoints(getLayoutIdx(), wps)
  // Start segment drag on the middle segment (idx=1, between wp[0] and wp[1])
  draggingSeg.value = { idx: 1, dir: dir === 'h' ? 'v' : 'h' }
  window.addEventListener('pointermove', onSegPointerMove)
  window.addEventListener('pointerup', onSegPointerUp)
}

function onRemoveWaypoint(e: PointerEvent, idx: number) {
  e.stopPropagation(); e.preventDefault()
  canvasStore.updateConnectionWaypoints(getLayoutIdx(), waypoints.value.filter((_, i) => i !== idx))
}

function onPathDblClick(e: MouseEvent) {
  if (!props.selected) return
  e.stopPropagation()
  const svg = (e.target as SVGElement).closest('svg')
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  const x = (e.clientX - rect.left - viewport.value.x) / viewport.value.zoom
  const y = (e.clientY - rect.top - viewport.value.y) / viewport.value.zoom
  canvasStore.updateConnectionWaypoints(getLayoutIdx(), [...waypoints.value, { x, y }])
}
</script>

<template>
  <!-- Custom arrow markers (shared) -->
  <defs>
    <marker id="gs-edge-arrow" markerWidth="12" markerHeight="12" refX="10" refY="4" orient="auto" markerUnits="strokeWidth">
      <path d="M1,1 L1,7 L10,4 z" fill="var(--conn-default)" />
    </marker>
    <marker id="gs-edge-arrow-start" markerWidth="12" markerHeight="12" refX="2" refY="4" orient="auto-start-reverse" markerUnits="strokeWidth">
      <path d="M1,1 L1,7 L10,4 z" fill="var(--conn-default)" />
    </marker>
  </defs>

  <!-- Hit area -->
  <path
    :d="path"
    fill="none"
    stroke="transparent"
    stroke-width="14"
    style="pointer-events: stroke"
    @dblclick="onPathDblClick"
  />
  <!-- Visible edge -->
  <path
    :id="id"
    :d="path"
    fill="none"
    :stroke="selected ? 'var(--color-accent)' : 'var(--conn-default)'"
    :stroke-width="selected ? 2.5 : 1.5"
    stroke-linejoin="round"
    :marker-end="markerEnd"
    :marker-start="markerStart"
    style="pointer-events: none"
  />
  <!-- Label -->
  <g v-if="label" :transform="`translate(${labelX}, ${labelY})`">
    <rect :x="-label.length * 3.2" y="-9" :width="label.length * 6.4" height="15" rx="3"
      fill="var(--color-bg-primary)" fill-opacity="0.9" />
    <text text-anchor="middle" dominant-baseline="middle" font-size="9"
      fill="var(--color-text-muted)">{{ label }}</text>
  </g>

  <!-- Waypoint controls (when selected) -->
  <template v-if="selected">
    <!-- Snap guide lines -->
    <line v-if="guideX !== null" :x1="guideX" y1="-9999" :x2="guideX" y2="9999"
      stroke="var(--color-accent)" stroke-width="0.5" stroke-dasharray="4,3" opacity="0.6" style="pointer-events:none" />
    <line v-if="guideY !== null" x1="-9999" :y1="guideY" x2="9999" :y2="guideY"
      stroke="var(--color-accent)" stroke-width="0.5" stroke-dasharray="4,3" opacity="0.6" style="pointer-events:none" />

    <!-- Segment drag handles (midpoint of each segment) -->
    <rect
      v-for="seg in segMidpoints" :key="'seg'+seg.idx"
      :x="seg.x - 6" :y="seg.y - 6" width="12" height="12" rx="2"
      fill="var(--color-accent)" fill-opacity="0.15"
      stroke="var(--color-accent)" stroke-width="1" stroke-opacity="0.5"
      :style="{ cursor: seg.dir === 'h' ? 'ns-resize' : 'ew-resize', pointerEvents: 'all' }"
      @pointerdown.stop="(e: PointerEvent) => onSegPointerDown(e, seg.idx, seg.dir)"
    />

    <!-- Existing waypoints -->
    <circle
      v-for="(wp, idx) in waypoints" :key="idx"
      :cx="wp.x" :cy="wp.y" r="5"
      fill="var(--color-accent)" stroke="white" stroke-width="1.5"
      style="cursor: move; pointer-events: all"
      @pointerdown="(e: PointerEvent) => onWpPointerDown(e, idx)"
      @dblclick.stop="(e: PointerEvent) => onRemoveWaypoint(e, idx)"
    />

    <!-- Initial drag handle when no waypoints (creates orthogonal waypoints) -->
    <rect
      v-if="midpoint"
      :x="midpoint.x - 6" :y="midpoint.y - 6" width="12" height="12" rx="2"
      fill="var(--color-accent)" fill-opacity="0.2"
      stroke="var(--color-accent)" stroke-width="1.5" stroke-dasharray="3,2"
      :style="{ cursor: initSegDir === 'h' ? 'ns-resize' : 'ew-resize', pointerEvents: 'all' }"
      @pointerdown.stop="onInitSegDown"
    />
  </template>
</template>
