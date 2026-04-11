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

// Layout — pass theme so node sizes are correct
const layout = useLayout(() => props.diagram, () => props.display, () => props.theme)

// Zone color map: rootName → CSS var
const ZONE_COLORS = [
  'var(--zone-color-1)', 'var(--zone-color-2)', 'var(--zone-color-3)',
  'var(--zone-color-4)', 'var(--zone-color-5)', 'var(--zone-color-6)',
]
const zoneColorMap = computed(() => {
  const map = new Map<string, string>()
  props.diagram.zones.forEach((z, i) => map.set(z.name, ZONE_COLORS[i % ZONE_COLORS.length]))
  return map
})

// Use rootName (tracked in ZoneRect) for consistent sub-zone coloring
function zoneColor(rootName: string): string {
  return zoneColorMap.value.get(rootName) ?? ZONE_COLORS[0]
}

// Lint: isolated-node warning set
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

// Node size matches layout
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
        <!-- Zones (back to front by depth) -->
        <g class="zones">
          <g v-for="zr in layout.zoneRects" :key="zr.name + zr.x + zr.y">
            <rect
              :x="zr.x" :y="zr.y" :width="zr.w" :height="zr.h"
              rx="8"
              :fill="zoneColor(zr.rootName)"
              :fill-opacity="0.12 - zr.depth * 0.02"
              :stroke="zoneColor(zr.rootName)"
              stroke-opacity="0.4"
              stroke-width="1"
            />
            <!-- Title bar (two rects to get flat bottom) -->
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
