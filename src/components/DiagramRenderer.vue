<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEventListener } from '@vueuse/core'
import type { NetworkDiagram, LintDiagnostic } from '@/types/index'
import { useLayout } from '@/composables/useLayout'
import NodeRenderer from './NodeRenderer.vue'
import ConnectionRenderer from './ConnectionRenderer.vue'

const props = defineProps<{
  diagram: NetworkDiagram
  theme: 'simple' | 'icon' | 'image'
  display: 'LR' | 'TD'
  showTags: boolean
  lintDiagnostics?: LintDiagnostic[]
}>()

// Pan/zoom state
const pan = ref({ x: 0, y: 0 })
const zoom = ref(1)
const isPanning = ref(false)
const lastMouse = ref({ x: 0, y: 0 })
const svgRef = ref<SVGSVGElement | null>(null)

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  zoom.value = Math.min(4, Math.max(0.2, zoom.value * delta))
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

// Layout
const layout = useLayout(() => props.diagram, () => props.display)

// Zone colors (cycle through 6)
const ZONE_COLORS = [
  'var(--zone-color-1)', 'var(--zone-color-2)', 'var(--zone-color-3)',
  'var(--zone-color-4)', 'var(--zone-color-5)', 'var(--zone-color-6)',
]
// Map top-level zone name → color index
const zoneColorMap = computed(() => {
  const map = new Map<string, string>()
  props.diagram.zones.forEach((z, i) => map.set(z.name, ZONE_COLORS[i % ZONE_COLORS.length]))
  return map
})

function zoneColor(name: string, depth: number): string {
  // Find root zone name by checking zoneRects
  const rootZone = props.diagram.zones.find(z => z.name === name)
  const color = zoneColorMap.value.get(name) ?? ZONE_COLORS[0]
  if (rootZone) return color
  // For sub-zones, find parent color
  for (const [k, v] of zoneColorMap.value) {
    if (name !== k) return v // simplified: use first found
  }
  return ZONE_COLORS[0]
}

// Lint warning nodes set
const lintWarnNodes = computed(() => {
  const s = new Set<string>()
  for (const d of props.lintDiagnostics ?? []) {
    if (d.rule === 'isolated-node') {
      // find node name from message
      const m = d.message.match(/"(.+)"/)
      if (m) s.add(m[1])
    }
  }
  return s
})

// Node dimensions
const NODE_W = 140
const NODE_H = 64
const ICON_W = 100
const ICON_H = 90

function nodeSize(theme: string) {
  return theme === 'simple' ? { w: NODE_W, h: NODE_H } : { w: ICON_W, h: ICON_H }
}
</script>

<template>
  <div class="diagram-renderer" @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp">
    <svg
      v-if="diagram.nodes.length > 0"
      ref="svgRef"
      width="100%"
      height="100%"
      @mousedown="onMouseDown"
      style="cursor: grab"
      :style="isPanning ? 'cursor: grabbing' : ''"
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
            <rect
              :x="zr.x" :y="zr.y" :width="zr.w" :height="zr.h"
              rx="8"
              :fill="zoneColor(zr.name, zr.depth)"
              :fill-opacity="0.12 - zr.depth * 0.02"
              :stroke="zoneColor(zr.name, zr.depth)"
              stroke-opacity="0.4"
              stroke-width="1"
            />
            <!-- Zone title bar -->
            <rect
              :x="zr.x" :y="zr.y" :width="zr.w" height="24"
              rx="8"
              :fill="zoneColor(zr.name, zr.depth)"
              :fill-opacity="0.35 - zr.depth * 0.05"
            />
            <rect :x="zr.x" :y="zr.y + 16" :width="zr.w" height="8"
              :fill="zoneColor(zr.name, zr.depth)"
              :fill-opacity="0.35 - zr.depth * 0.05"
            />
            <text
              :x="zr.x + 10" :y="zr.y + 14"
              dominant-baseline="middle"
              font-size="11" font-weight="600"
              fill="var(--color-text-primary)"
            >{{ zr.name }}</text>
          </g>
        </g>

        <!-- Connections -->
        <g class="connections">
          <ConnectionRenderer
            v-for="conn in diagram.connections"
            :key="`${conn.from}-${conn.to}-${conn.line}`"
            :connection="conn"
            :from-pos="layout.nodeRects.get(conn.from) ?? { x: 0, y: 0, w: 0, h: 0 }"
            :to-pos="layout.nodeRects.get(conn.to) ?? { x: 0, y: 0, w: 0, h: 0 }"
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
            :w="nodeSize(theme).w"
            :h="nodeSize(theme).h"
            :theme="theme"
            :show-tags="showTags"
            :is-lint-warning="lintWarnNodes.has(node.name)"
          />
        </g>
      </g>
    </svg>

    <!-- Empty state -->
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
