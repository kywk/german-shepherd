<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEventListener } from '@vueuse/core'
import type { NetworkDiagram, LintDiagnostic, DiffState } from '@/types/index'
import { useLayout, type NodeRect } from '@/composables/useLayout'
import NodeRenderer from './NodeRenderer.vue'
import ConnectionRenderer from './ConnectionRenderer.vue'

const props = defineProps<{
  diagram: NetworkDiagram
  theme: 'simple' | 'icon' | 'image'
  display: 'LR' | 'TD'
  showTags: boolean
  lintDiagnostics?: LintDiagnostic[]
  nodeDiffMap?: Map<string, DiffState>
}>()

// Pan/zoom
const pan = ref({ x: 0, y: 0 })
const zoom = ref(1)
const isPanning = ref(false)
const lastMouse = ref({ x: 0, y: 0 })
const svgRef = ref<SVGSVGElement | null>(null)

function onWheel(e: WheelEvent) {
  e.preventDefault()
  zoom.value = Math.min(4, Math.max(0.2, zoom.value * (e.deltaY > 0 ? 0.9 : 1.1)))
}
function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  isPanning.value = true
  lastMouse.value = { x: e.clientX, y: e.clientY }
}
function onMouseMove(e: MouseEvent) {
  if (!isPanning.value) return
  pan.value.x += e.clientX - lastMouse.value.x
  pan.value.y += e.clientY - lastMouse.value.y
  lastMouse.value = { x: e.clientX, y: e.clientY }
}
function onMouseUp() { isPanning.value = false }

useEventListener(svgRef, 'wheel', onWheel, { passive: false })

const layout = useLayout(() => props.diagram, () => props.display, () => props.theme)

// ---- Port assignment ----
type Side = 'top' | 'bottom' | 'left' | 'right'

function chooseSide(from: NodeRect, to: NodeRect): { fromSide: Side; toSide: Side } {
  const fcx = from.x + from.w / 2
  const fcy = from.y + from.h / 2
  const tcx = to.x + to.w / 2
  const tcy = to.y + to.h / 2
  const dx = tcx - fcx
  const dy = tcy - fcy

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { fromSide: 'right', toSide: 'left' }
      : { fromSide: 'left', toSide: 'right' }
  } else {
    return dy >= 0
      ? { fromSide: 'bottom', toSide: 'top' }
      : { fromSide: 'top', toSide: 'bottom' }
  }
}

interface PortPoint { x: number; y: number }

/**
 * Compute port positions for all connections.
 * Ports on each node+side are sorted by the OTHER node's position
 * (so the top port connects to the topmost target, etc.)
 */
const portMap = computed(() => {
  const rects = layout.value.nodeRects

  // Build combined rect map: nodes + sub-zones (depth > 0) as connection endpoints
  const allRects = new Map<string, NodeRect>(rects)
  for (const zr of layout.value.zoneRects) {
    if (zr.depth > 0 && !allRects.has(zr.name)) {
      allRects.set(zr.name, { x: zr.x, y: zr.y, w: zr.w, h: zr.h })
    }
  }

  const conns = props.diagram.connections

  // Step 1: determine sides for each connection
  const connSides: { fromSide: Side; toSide: Side }[] = []
  for (let i = 0; i < conns.length; i++) {
    const c = conns[i]
    const fromR = allRects.get(c.from)
    const toR = allRects.get(c.to)
    if (!fromR || !toR) { connSides.push({ fromSide: 'right', toSide: 'left' }); continue }
    connSides.push(chooseSide(fromR, toR))
  }

  // Step 2: group connections by node+side
  const sideUsage = new Map<string, number[]>()
  for (let i = 0; i < conns.length; i++) {
    const c = conns[i]
    const { fromSide, toSide } = connSides[i]
    const fk = `${c.from}:${fromSide}`
    const tk = `${c.to}:${toSide}`
    if (!sideUsage.has(fk)) sideUsage.set(fk, [])
    sideUsage.get(fk)!.push(i)
    if (!sideUsage.has(tk)) sideUsage.set(tk, [])
    sideUsage.get(tk)!.push(i)
  }

  // Step 3: sort each side's connections by the OTHER node's position along the edge axis
  // For left/right sides: sort by target node center Y
  // For top/bottom sides: sort by target node center X
  function otherNodePos(connIdx: number, nodeName: string, side: Side): number {
    const c = conns[connIdx]
    const otherName = c.from === nodeName ? c.to : c.from
    const r = allRects.get(otherName)
    if (!r) return 0
    return (side === 'left' || side === 'right')
      ? r.y + r.h / 2
      : r.x + r.w / 2
  }

  for (const [key, list] of sideUsage) {
    const [nodeName, side] = key.split(':') as [string, Side]
    list.sort((a, b) => otherNodePos(a, nodeName, side) - otherNodePos(b, nodeName, side))
  }

  // Step 4: compute port positions
  function portOnSide(rect: NodeRect, side: Side, index: number, total: number): PortPoint {
    const t = total === 1 ? 0.5 : (index + 1) / (total + 1)
    switch (side) {
      case 'left':   return { x: rect.x,          y: rect.y + rect.h * t }
      case 'right':  return { x: rect.x + rect.w, y: rect.y + rect.h * t }
      case 'top':    return { x: rect.x + rect.w * t, y: rect.y }
      case 'bottom': return { x: rect.x + rect.w * t, y: rect.y + rect.h }
    }
  }

  const result: { from: PortPoint; to: PortPoint; fromSide: Side }[] = []

  for (let i = 0; i < conns.length; i++) {
    const c = conns[i]
    const fromR = allRects.get(c.from)
    const toR = allRects.get(c.to)
    if (!fromR || !toR) {
      result.push({ from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, fromSide: 'right' })
      continue
    }
    const { fromSide, toSide } = connSides[i]
    const fk = `${c.from}:${fromSide}`
    const tk = `${c.to}:${toSide}`
    const fList = sideUsage.get(fk)!
    const tList = sideUsage.get(tk)!
    result.push({
      from: portOnSide(fromR, fromSide, fList.indexOf(i), fList.length),
      to:   portOnSide(toR,   toSide,   tList.indexOf(i), tList.length),
      fromSide,
    })
  }

  return result
})

// Zone colors
const ZONE_COLORS = [
  'var(--zone-color-1)', 'var(--zone-color-2)', 'var(--zone-color-3)',
  'var(--zone-color-4)', 'var(--zone-color-5)', 'var(--zone-color-6)',
]
const zoneColorMap = computed(() => {
  const map = new Map<string, string>()
  props.diagram.zones.forEach((z, i) => map.set(z.name, ZONE_COLORS[i % ZONE_COLORS.length]))
  return map
})
function zoneColor(rootName: string): string {
  return zoneColorMap.value.get(rootName) ?? ZONE_COLORS[0]
}

// Lint warning nodes
const lintWarnNodes = computed(() => {
  const s = new Set<string>()
  for (const d of props.lintDiagnostics ?? []) {
    if (d.rule === 'isolated-node') {
      const m = d.message.match(/"(.+)"/)
      if (m) s.add(m[1])
    }
  }
  return s
})

function nodeSize() {
  return props.theme === 'simple' ? { w: 140, h: 64 } : { w: 100, h: 90 }
}
</script>

<template>
  <div
    class="diagram-renderer"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseUp"
  >
    <svg
      v-if="diagram.nodes.length > 0"
      ref="svgRef"
      width="100%"
      height="100%"
      @mousedown="onMouseDown"
      :style="{ cursor: isPanning ? 'grabbing' : 'grab' }"
    >
      <defs>
        <marker id="arrow-end" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="var(--conn-default)" />
        </marker>
        <marker id="arrow-start" markerWidth="8" markerHeight="8" refX="2" refY="3" orient="auto-start-reverse">
          <path d="M0,0 L0,6 L8,3 z" fill="var(--conn-default)" />
        </marker>
      </defs>

      <g :transform="`translate(${pan.x}, ${pan.y}) scale(${zoom})`">
        <!-- Zones -->
        <g class="zones">
          <g v-for="zr in layout.zoneRects" :key="zr.name + zr.x + zr.y">
            <!-- Top-level zone (depth=0): dashed vertical divider + label -->
            <template v-if="zr.depth === 0">
              <!-- Left dashed separator line -->
              <line
                :x1="zr.x" :y1="zr.y"
                :x2="zr.x" :y2="zr.y + zr.h"
                stroke="var(--color-text-muted)"
                stroke-width="1.5"
                stroke-dasharray="6,4"
                stroke-opacity="0.55"
              />
              <!-- Zone label at top center of the zone column -->
              <text
                :x="zr.x + zr.w / 2" :y="zr.y + 20"
                text-anchor="middle"
                dominant-baseline="middle"
                font-size="13" font-weight="700"
                fill="var(--color-text-primary)"
              >{{ zr.name }}</text>
            </template>

            <!-- Sub-zone (depth>0): filled rectangle with header -->
            <template v-else>
              <rect
                :x="zr.x" :y="zr.y" :width="zr.w" :height="zr.h"
                rx="8"
                :fill="zoneColor(zr.rootName)"
                :fill-opacity="0.12 - zr.depth * 0.02"
                :stroke="zoneColor(zr.rootName)"
                stroke-opacity="0.4"
                stroke-width="1"
              />
              <rect
                :x="zr.x" :y="zr.y" :width="zr.w" height="24"
                rx="8"
                :fill="zoneColor(zr.rootName)"
                :fill-opacity="0.35 - zr.depth * 0.05"
              />
              <rect
                :x="zr.x" :y="zr.y + 16" :width="zr.w" height="8"
                :fill="zoneColor(zr.rootName)"
                :fill-opacity="0.35 - zr.depth * 0.05"
              />
              <text
                :x="zr.x + 10" :y="zr.y + 14"
                dominant-baseline="middle"
                font-size="11" font-weight="600"
                fill="var(--color-text-primary)"
              >{{ zr.name }}</text>
            </template>
          </g>
        </g>

        <!-- Connections -->
        <g class="connections">
          <ConnectionRenderer
            v-for="(conn, i) in diagram.connections"
            :key="`${conn.from}-${conn.to}-${conn.line}`"
            :connection="conn"
            :from-port="portMap[i]?.from ?? { x: 0, y: 0 }"
            :to-port="portMap[i]?.to ?? { x: 0, y: 0 }"
            :from-side="portMap[i]?.fromSide ?? 'right'"
            :all-node-rects="layout.nodeRects"
          />
        </g>

        <!-- Nodes -->
        <g class="nodes">
          <NodeRenderer
            v-for="node in diagram.nodes"
            :key="node.name"
            :node="node"
            :x="layout.nodeRects.get(node.name)?.x ?? 0"
            :y="layout.nodeRects.get(node.name)?.y ?? 0"
            :w="nodeSize().w"
            :h="nodeSize().h"
            :theme="theme"
            :show-tags="showTags"
            :is-lint-warning="lintWarnNodes.has(node.name)"
            :diff-state="nodeDiffMap?.get(node.name)"
          />
        </g>
      </g>
    </svg>

    <div v-else class="empty-state">
      <p>🐕 請在左側編輯區輸入架構圖語法...</p>
    </div>
  </div>
</template>

<style scoped>
.diagram-renderer {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  background: var(--color-bg-primary);
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  font-size: 1.1rem;
}
</style>
