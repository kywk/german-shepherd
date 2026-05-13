<script setup lang="ts">
import { computed, watch, ref } from 'vue'
import { VueFlow, useVueFlow, MarkerType } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Node, Edge, Connection } from '@vue-flow/core'
import type { NetworkDiagram, LintDiagnostic, DiffState } from '@/types/index'
import { useLayout } from '@/composables/useLayout'
import { useCanvasStore } from '@/stores/canvasStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { toLayoutGraph } from '@/layout/graphConverter'
import { runElkLayout } from '@/layout/elkLayout'
import { toVueFlowGraph } from '@/layout/vueFlowAdapter'
import type { LayoutResult } from '@/layout/types'
import FlowNode from './FlowNode.vue'
import FlowEdge from './FlowEdge.vue'
import FlowZone from './FlowZone.vue'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

const props = defineProps<{
  diagram: NetworkDiagram
  theme: 'simple' | 'icon' | 'image'
  display: 'LR' | 'TD'
  showTags: boolean
  lintDiagnostics?: LintDiagnostic[]
  nodeDiffMap?: Map<string, DiffState>
  isManualMode?: boolean
}>()

const canvasStore = useCanvasStore()
const workspaceStore = useWorkspaceStore()
const layout = useLayout(() => props.diagram, () => props.display, () => props.theme)

// ELK layout state
const elkLayoutResult = ref<LayoutResult | null>(null)
const elkFlowData = ref<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] })

watch(
  () => [props.diagram, props.display, props.theme, props.showTags, props.isManualMode] as const,
  async ([diagram, display, theme, showTags, isManual]) => {
    if (isManual || diagram.nodes.length === 0) return
    const layoutGraph = toLayoutGraph(diagram, { theme, direction: display })
    const result = await runElkLayout(layoutGraph)
    elkLayoutResult.value = result
    elkFlowData.value = toVueFlowGraph(result, diagram, {
      theme,
      showTags,
      lintWarnNodes: lintWarnNodes.value,
      isManualMode: false,
    })
  },
  { immediate: true, deep: true }
)

// Connection form
const showConnectionForm = ref(false)
const pendingConnection = ref<Connection | null>(null)
const connFormData = ref({ protocol: 'HTTP', direction: 'forward' as 'forward' | 'bidirectional' | 'none', description: '' })

// Node edit form
const showNodeForm = ref(false)
const nodeFormData = ref({ name: '', type: 'AP Server', note: '', tags: '' })
const editingNodeId = ref<string | null>(null)

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

// ─── Convert diagram data to Vue Flow nodes/edges ───

const ZONE_COLORS = ['var(--zone-color-1)', 'var(--zone-color-2)', 'var(--zone-color-3)', 'var(--zone-color-4)', 'var(--zone-color-5)', 'var(--zone-color-6)']
const zoneColorMap = computed(() => {
  const map = new Map<string, string>()
  props.diagram.zones.forEach((z, i) => map.set(z.name, ZONE_COLORS[i % ZONE_COLORS.length]))
  return map
})

const zoneRects = computed(() => {
  if (!props.isManualMode) return layout.value.zoneRects

  const PAD = 30
  const HEADER = 30
  const rects: typeof layout.value.zoneRects = []
  const nodeRects = new Map<string, { x: number; y: number; w: number; h: number }>()
  const { w: NW, h: NH } = props.theme === 'simple' ? { w: 160, h: 70 } : { w: 120, h: 95 }
  const ld = canvasStore.layoutData

  for (const node of props.diagram.nodes) {
    const pos = ld.nodes[node.name]
    if (pos) nodeRects.set(node.name, { x: pos.x, y: pos.y, w: NW, h: NH })
    else {
      const auto = layout.value.nodeRects.get(node.name)
      if (auto) nodeRects.set(node.name, auto)
    }
  }

  function computeZone(zone: typeof props.diagram.zones[0], rootName: string) {
    const names: string[] = []
    function collect(z: typeof zone) {
      for (const child of z.children) {
        if ('children' in child) collect(child as typeof zone)
        else names.push((child as { name: string }).name)
      }
    }
    collect(zone)

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const name of names) {
      const r = nodeRects.get(name)
      if (!r) continue
      if (r.x < minX) minX = r.x
      if (r.y < minY) minY = r.y
      if (r.x + r.w > maxX) maxX = r.x + r.w
      if (r.y + r.h > maxY) maxY = r.y + r.h
    }
    if (minX === Infinity) return

    const isTopLevel = zone.depth === 0
    const zonePad = isTopLevel ? PAD + 20 : PAD
    rects.push({ x: minX - zonePad, y: minY - PAD - HEADER, w: maxX - minX + zonePad * 2, h: maxY - minY + PAD * 2 + HEADER, depth: zone.depth, name: zone.name, rootName })

    for (const child of zone.children) {
      if ('children' in child) computeZone(child as typeof zone, rootName)
    }
  }

  for (const zone of props.diagram.zones) computeZone(zone, zone.name)
  return rects
})

const flowNodes = computed((): Node[] => {
  // Auto mode: use ELK layout results
  if (!props.isManualMode && elkFlowData.value.nodes.length > 0) {
    return elkFlowData.value.nodes
  }

  // Manual mode: use canvasStore positions with old layout as fallback
  const ld = canvasStore.layoutData
  const autoRects = layout.value.nodeRects
  const nodes: Node[] = []

  const PAD = 30
  const HEADER = 30

  // Build node→zone mapping (only sub-zones, depth > 0)
  const nodeZone = new Map<string, string>() // nodeName → zone id
  const subZoneParent = new Map<string, string>() // subZoneName → parent zone id (for nested)
  function walkZones(zones: typeof props.diagram.zones, parentZoneId?: string) {
    for (const z of zones) {
      const zoneId = `__zone__${z.name}`
      if (z.depth > 0 && parentZoneId) {
        subZoneParent.set(z.name, parentZoneId)
      }
      for (const child of z.children) {
        if ('children' in child) {
          walkZones([child as typeof z], z.depth > 0 ? zoneId : undefined)
        } else {
          if (z.depth > 0) nodeZone.set((child as { name: string }).name, zoneId)
        }
      }
    }
  }
  walkZones(props.diagram.zones)

  // Compute absolute positions for all nodes
  const absPositions = new Map<string, { x: number; y: number }>()
  for (const node of props.diagram.nodes) {
    if (ld.nodes[node.name]) {
      absPositions.set(node.name, ld.nodes[node.name])
    } else {
      const rect = autoRects.get(node.name)
      absPositions.set(node.name, { x: rect?.x ?? 0, y: rect?.y ?? 0 })
    }
  }

  // Compute sub-zone rects from child node positions (absolute)
  const { w: NW, h: NH } = props.theme === 'simple' ? { w: 160, h: 70 } : { w: 120, h: 95 }
  const zoneAbsRects = new Map<string, { x: number; y: number; w: number; h: number }>()

  function computeSubZoneRect(zone: typeof props.diagram.zones[0]) {
    if (zone.depth === 0) {
      for (const child of zone.children) {
        if ('children' in child) computeSubZoneRect(child as typeof zone)
      }
      return
    }
    // Collect all descendant nodes
    const names: string[] = []
    function collect(z: typeof zone) {
      for (const child of z.children) {
        if ('children' in child) collect(child as typeof zone)
        else names.push((child as { name: string }).name)
      }
    }
    collect(zone)

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const name of names) {
      const pos = absPositions.get(name)
      if (!pos) continue
      if (pos.x < minX) minX = pos.x
      if (pos.y < minY) minY = pos.y
      if (pos.x + NW > maxX) maxX = pos.x + NW
      if (pos.y + NH > maxY) maxY = pos.y + NH
    }
    if (minX === Infinity) return

    zoneAbsRects.set(zone.name, {
      x: minX - PAD,
      y: minY - PAD - HEADER,
      w: maxX - minX + PAD * 2,
      h: maxY - minY + PAD * 2 + HEADER,
    })

    // Recurse for nested sub-zones
    for (const child of zone.children) {
      if ('children' in child) computeSubZoneRect(child as typeof zone)
    }
  }
  for (const zone of props.diagram.zones) computeSubZoneRect(zone)

  // Create sub-zone group nodes (depth > 0 only — top-level zones stay as background)
  for (const zone of props.diagram.zones) {
    function addSubZoneNodes(z: typeof zone, rootName: string) {
      if (z.depth > 0) {
        const rect = zoneAbsRects.get(z.name)
        if (rect) {
          nodes.push({
            id: `__zone__${z.name}`,
            type: 'gsZone',
            position: { x: rect.x, y: rect.y },
            style: { width: `${rect.w}px`, height: `${rect.h}px` },
            data: {
              name: z.name,
              depth: z.depth,
              color: zoneColorMap.value.get(rootName) ?? ZONE_COLORS[0],
              w: rect.w,
              h: rect.h,
            },
            draggable: false,
            selectable: false,
            connectable: true,
          })
        }
      }
      for (const child of z.children) {
        if ('children' in child) addSubZoneNodes(child as typeof zone, rootName)
      }
    }
    addSubZoneNodes(zone, zone.name)
  }

  // Top-level zone backgrounds (depth === 0, non-interactive)
  for (const zr of zoneRects.value) {
    if (zr.depth === 0) {
      nodes.push({
        id: `__zone__${zr.name}`,
        type: 'gsZone',
        position: { x: zr.x, y: zr.y },
        data: {
          name: zr.name,
          depth: 0,
          color: zoneColorMap.value.get(zr.rootName) ?? ZONE_COLORS[0],
          w: zr.w,
          h: zr.h,
        },
        draggable: false,
        selectable: false,
        connectable: false,
        zIndex: -1,
      })
    }
  }

  // Regular nodes — absolute positions (no parentNode to avoid Vue Flow group issues)
  for (const node of props.diagram.nodes) {
    const abs = absPositions.get(node.name)!

    const n: Node = {
      id: node.name,
      type: 'gsNode',
      position: { x: abs.x, y: abs.y },
      data: {
        name: node.name,
        type: node.type,
        note: node.note,
        tags: node.tags,
        theme: props.theme,
        showTags: props.showTags,
        isLintWarning: lintWarnNodes.value.has(node.name),
      },
      draggable: true,
    }
    nodes.push(n)
  }

  return nodes
})

const flowEdges = computed(() => {
  // Auto mode: use ELK layout results
  if (!props.isManualMode && elkFlowData.value.edges.length > 0) {
    return elkFlowData.value.edges
  }

  // Manual mode: use canvasStore layout data
  const ld = canvasStore.layoutData
  const nodeNames = new Set(props.diagram.nodes.map(n => n.name))

  // Resolve zone name to zone group node id
  function resolveEndpoint(name: string): string {
    if (nodeNames.has(name)) return name
    return `__zone__${name}`
  }

  // Build a lookup for layout connections by from+to (handle duplicates with counter)
  const layoutLookup = new Map<string, typeof ld.connections[0][]>()
  for (const lc of ld.connections) {
    const key = `${lc.from}::${lc.to}`
    if (!layoutLookup.has(key)) layoutLookup.set(key, [])
    layoutLookup.get(key)!.push(lc)
  }
  const layoutUsed = new Map<string, number>()

  return props.diagram.connections.map((conn, i) => {
    const source = resolveEndpoint(conn.from)
    const target = resolveEndpoint(conn.to)

    const key = `${conn.from}::${conn.to}`
    const candidates = layoutLookup.get(key) ?? []
    const usedIdx = layoutUsed.get(key) ?? 0
    const layoutConn = candidates[usedIdx]
    layoutUsed.set(key, usedIdx + 1)

    const edge = {
      id: `${conn.from}-${conn.to}-${i}`,
      source,
      target,
      sourceHandle: layoutConn ? `${source}-${layoutConn.fromSide}` : `${source}-right`,
      targetHandle: layoutConn ? `${target}-${layoutConn.toSide}` : `${target}-left`,
      type: 'gsEdge',
      updatable: props.isManualMode && canvasStore.selectedConnectionIndex === i,
      markerEnd: conn.direction !== 'none' ? MarkerType.ArrowClosed : undefined,
      markerStart: conn.direction === 'bidirectional' ? MarkerType.ArrowClosed : undefined,
      data: {
        protocol: conn.protocol,
        description: conn.description,
        direction: conn.direction,
        waypoints: layoutConn?.waypoints,
      },
    }
    if (target.startsWith('__zone__') || source.startsWith('__zone__')) {
      console.log('[edge]', conn.from, '->', conn.to, { source, target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle })
    }
    return edge
  })
})

// ─── Vue Flow instance ───
const { onNodeDragStop, onNodeDrag, onConnect, onEdgesChange, onPaneClick, onNodeDoubleClick, onEdgeUpdate, onEdgeClick, getNodes, viewport, updateNodeInternals, onNodesInitialized } = useVueFlow()

// Force handle bounds recalculation for zone nodes after render
onNodesInitialized(() => {
  const zoneIds = getNodes.value.filter(n => n.type === 'gsZone' && n.connectable).map(n => n.id)
  if (zoneIds.length) setTimeout(() => updateNodeInternals(zoneIds), 50)
})

watch(() => props.isManualMode, (manual) => {
  if (manual) {
    setTimeout(() => {
      const zoneIds = getNodes.value.filter(n => n.type === 'gsZone' && n.connectable).map(n => n.id)
      if (zoneIds.length) updateNodeInternals(zoneIds)
    }, 200)
  }
})

const SNAP_THRESHOLD = 5
const alignmentGuides = ref<{ x: number | null; y: number | null }>({ x: null, y: null })

onNodeDrag(({ node }) => {
  if (!props.isManualMode) return
  const draggedId = node.id
  const dragX = node.position.x
  const dragY = node.position.y
  const dragW = node.dimensions?.width ?? 140
  const dragH = node.dimensions?.height ?? 64
  const dragCx = dragX + dragW / 2
  const dragCy = dragY + dragH / 2

  let closestX: number | null = null
  let closestY: number | null = null
  let minDx = SNAP_THRESHOLD + 1
  let minDy = SNAP_THRESHOLD + 1

  for (const other of getNodes.value) {
    if (other.id === draggedId || other.type === 'gsZone') continue
    const ox = other.position.x
    const oy = other.position.y
    const ow = other.dimensions?.width ?? 140
    const oh = other.dimensions?.height ?? 64
    const ocx = ox + ow / 2
    const ocy = oy + oh / 2

    // Check center-X alignment
    const dxc = Math.abs(dragCx - ocx)
    if (dxc < minDx) { minDx = dxc; closestX = ocx }
    // Check left alignment
    const dxl = Math.abs(dragX - ox)
    if (dxl < minDx) { minDx = dxl; closestX = ox + dragW / 2 }
    // Check right alignment
    const dxr = Math.abs(dragX + dragW - (ox + ow))
    if (dxr < minDx) { minDx = dxr; closestX = ox + ow - dragW / 2 }

    // Check center-Y alignment
    const dyc = Math.abs(dragCy - ocy)
    if (dyc < minDy) { minDy = dyc; closestY = ocy }
    // Check top alignment
    const dyt = Math.abs(dragY - oy)
    if (dyt < minDy) { minDy = dyt; closestY = oy + dragH / 2 }
    // Check bottom alignment
    const dyb = Math.abs(dragY + dragH - (oy + oh))
    if (dyb < minDy) { minDy = dyb; closestY = oy + oh - dragH / 2 }
  }

  alignmentGuides.value = {
    x: minDx <= SNAP_THRESHOLD ? closestX : null,
    y: minDy <= SNAP_THRESHOLD ? closestY : null,
  }

  // Snap node position
  if (minDx <= SNAP_THRESHOLD && closestX !== null) node.position.x = closestX - dragW / 2
  if (minDy <= SNAP_THRESHOLD && closestY !== null) node.position.y = closestY - dragH / 2
})

// Sync edge selection to canvasStore
onEdgeClick(({ edge }) => {
  if (!props.isManualMode) return
  const idx = props.diagram.connections.findIndex((c, i) => `${c.from}-${c.to}-${i}` === edge.id)
  if (idx >= 0) canvasStore.selectConnection(idx)
})

// Node drag end → update canvasStore
onNodeDragStop(({ node }) => {
  if (!props.isManualMode) return
  alignmentGuides.value = { x: null, y: null }
  canvasStore.moveNode(node.id, node.position.x, node.position.y)
})

// Edge reconnected to different handle (port change)
onEdgeUpdate(({ edge, connection }) => {
  if (!props.isManualMode) return
  const idx = props.diagram.connections.findIndex((c, i) => `${c.from}-${c.to}-${i}` === edge.id)
  if (idx < 0) return
  const conn = props.diagram.connections[idx]
  const fromSide = (connection.sourceHandle?.split('-').pop() ?? 'right') as 'top' | 'bottom' | 'left' | 'right'
  const toSide = (connection.targetHandle?.split('-').pop() ?? 'left') as 'top' | 'bottom' | 'left' | 'right'

  // Find matching layout connection by from/to
  const ld = canvasStore.layoutData
  const layoutIdx = ld.connections.findIndex(lc => lc.from === conn.from && lc.to === conn.to)
  if (layoutIdx >= 0) {
    canvasStore.updateConnectionSides(layoutIdx, fromSide, toSide)
  } else {
    // Connection not in layout block yet — add it
    canvasStore.addConnection({ from: conn.from, to: conn.to, fromSide, toSide, waypoints: [] })
  }
})

// Connection created
onConnect((connection) => {
  if (!props.isManualMode) return
  pendingConnection.value = connection
  showConnectionForm.value = true
})

// Edge deleted (via keyboard)
onEdgesChange((changes) => {
  if (!props.isManualMode) return
  for (const change of changes) {
    if (change.type === 'remove') {
      const idx = props.diagram.connections.findIndex((c, i) => `${c.from}-${c.to}-${i}` === change.id)
      if (idx >= 0) canvasStore.removeConnection(idx)
    }
  }
})

// Double-click empty area → add node
onPaneClick((_event) => {
  if (!props.isManualMode) return
  // Only on double-click (handled separately)
})

// Double-click node → edit
onNodeDoubleClick(({ node }) => {
  if (!props.isManualMode) return
  const diagramNode = props.diagram.nodes.find(n => n.name === node.id)
  if (!diagramNode) return
  editingNodeId.value = node.id
  nodeFormData.value = {
    name: diagramNode.name,
    type: diagramNode.type,
    note: diagramNode.note ?? '',
    tags: diagramNode.tags?.join(', ') ?? '',
  }
  showNodeForm.value = true
})

// ─── Connection form ───
function confirmConnection() {
  if (!pendingConnection.value) return
  const { source, target, sourceHandle, targetHandle } = pendingConnection.value
  const { protocol, direction, description } = connFormData.value

  // Determine sides from handle IDs
  const fromSide = (sourceHandle?.split('-').pop() ?? 'right') as 'top' | 'bottom' | 'left' | 'right'
  const toSide = (targetHandle?.split('-').pop() ?? 'left') as 'top' | 'bottom' | 'left' | 'right'

  // Add connection to markdown body
  const rawText = workspaceStore.currentRawText
  const arrow = direction === 'forward' ? '->' : direction === 'bidirectional' ? '<->' : '--'
  const connLine = description
    ? `${source} ${arrow} ${target}: ${protocol}, ${description}`
    : `${source} ${arrow} ${target}: ${protocol}`

  const lines = rawText.split('\n')
  // Insert before code block
  let insertIdx = lines.length
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '```') {
      for (let j = i - 1; j >= 0; j--) {
        if (lines[j].trim() === '```') { insertIdx = j; break }
      }
      break
    }
  }
  lines.splice(insertIdx, 0, connLine)

  canvasStore.pushUndo()
  workspaceStore.updateCurrentRawText(lines.join('\n'))
  canvasStore.addConnection({ from: source!, to: target!, fromSide, toSide, waypoints: [] })

  showConnectionForm.value = false
  pendingConnection.value = null
  connFormData.value = { protocol: 'HTTP', direction: 'forward', description: '' }
}

function cancelConnection() {
  showConnectionForm.value = false
  pendingConnection.value = null
}

// ─── Node edit form ───
function confirmNodeEdit() {
  const oldName = editingNodeId.value
  if (!oldName) return
  const node = props.diagram.nodes.find(n => n.name === oldName)
  if (!node) return

  const { name: newName, type, note, tags } = nodeFormData.value
  const tagStr = tags.trim() ? ' ' + tags.trim().split(/[,\s]+/).map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : ''
  const noteStr = note.trim() ? `, ${note.trim()}` : ''
  const newLine = `  - ${newName.trim()}, ${type}${noteStr}${tagStr}`

  const rawText = workspaceStore.currentRawText
  const lines = rawText.split('\n')
  if (node.line > 0 && node.line <= lines.length) {
    lines[node.line - 1] = newLine
  }

  canvasStore.pushUndo()
  workspaceStore.updateCurrentRawText(lines.join('\n'))

  if (newName.trim() !== oldName) {
    canvasStore.renameNode(oldName, newName.trim())
  }

  showNodeForm.value = false
  editingNodeId.value = null
}

function cancelNodeEdit() {
  showNodeForm.value = false
  editingNodeId.value = null
}

// ─── Double-click pane to add node ───
function onPaneDblClick(event: MouseEvent) {
  if (!props.isManualMode) return
  // Vue Flow doesn't expose pane dblclick directly, we handle it on the wrapper
  const el = (event.target as HTMLElement)
  if (!el.closest('.vue-flow__node') && !el.closest('.vue-flow__edge')) {
    // Get position relative to the flow viewport
    const flowEl = el.closest('.vue-flow') as HTMLElement
    if (!flowEl) return
    const rect = flowEl.getBoundingClientRect()
    // We need to account for viewport transform — use project from useVueFlow
    // For simplicity, use canvasStore.addNodeAtPosition with approximate coords
    canvasStore.addNodeAtPosition(event.clientX - rect.left, event.clientY - rect.top)
  }
}



</script>

<template>
  <div class="diagram-renderer" @dblclick="onPaneDblClick">
    <VueFlow
      v-if="diagram.nodes.length > 0"
      :nodes="flowNodes"
      :edges="flowEdges"
      :nodes-draggable="isManualMode"
      :nodes-connectable="isManualMode"
      :edges-updatable="isManualMode"
      :delete-key-code="isManualMode ? ['Delete', 'Backspace'] : null"
      :elevate-edges-on-select="true"
      :selection-key-code="null"
      :multi-selection-key-code="null"
      :pan-on-drag="true"
      :selection-mode="'partial'"
      fit-view-on-init
      :min-zoom="0.2"
      :max-zoom="4"
    >
      <template #node-gsNode="nodeProps">
        <FlowNode v-bind="nodeProps" />
      </template>

      <template #node-gsZone="zoneProps">
        <FlowZone v-bind="zoneProps" />
      </template>

      <template #edge-gsEdge="edgeProps">
        <FlowEdge v-bind="edgeProps" />
      </template>

      <Background />
      <Controls />
      <MiniMap />

      <!-- Alignment guides during node drag -->
      <div v-if="alignmentGuides.x !== null" class="alignment-guide-v" :style="{ left: `${alignmentGuides.x * viewport.zoom + viewport.x}px` }" />
      <div v-if="alignmentGuides.y !== null" class="alignment-guide-h" :style="{ top: `${alignmentGuides.y * viewport.zoom + viewport.y}px` }" />
    </VueFlow>

    <div v-else class="empty-state">
      <p>🐕 請在左側編輯區輸入架構圖語法...</p>
    </div>

    <!-- Connection form -->
    <div v-if="showConnectionForm" class="form-overlay" @click.self="cancelConnection">
      <div class="form-dialog">
        <h4>新增連線</h4>
        <div class="form-row"><label>Protocol</label><select v-model="connFormData.protocol"><option v-for="p in ['HTTP','SOAP','WebSocket','gRPC','RFC','FTP','Socket','Others']" :key="p" :value="p">{{ p }}</option></select></div>
        <div class="form-row"><label>Direction</label><select v-model="connFormData.direction"><option value="forward">→ Forward</option><option value="bidirectional">↔ Bidirectional</option><option value="none">— None</option></select></div>
        <div class="form-row"><label>Description</label><input v-model="connFormData.description" placeholder="(optional)" @keydown.enter="confirmConnection" /></div>
        <div class="form-actions"><button class="btn btn-ghost" @click="cancelConnection">取消</button><button class="btn btn-primary" @click="confirmConnection">確認</button></div>
      </div>
    </div>

    <!-- Node edit form -->
    <div v-if="showNodeForm" class="form-overlay" @click.self="cancelNodeEdit">
      <div class="form-dialog">
        <h4>編輯節點</h4>
        <div class="form-row"><label>Name</label><input v-model="nodeFormData.name" @keydown.enter="confirmNodeEdit" /></div>
        <div class="form-row"><label>Type</label><select v-model="nodeFormData.type"><option v-for="t in ['App','Web','Firewall','WAF','F5','Storage','AP Server','Web Server','SAP','Database']" :key="t" :value="t">{{ t }}</option></select></div>
        <div class="form-row"><label>Note</label><input v-model="nodeFormData.note" placeholder="(optional)" /></div>
        <div class="form-row"><label>Tags</label><input v-model="nodeFormData.tags" placeholder="#tag1, #tag2" /></div>
        <div class="form-actions"><button class="btn btn-ghost" @click="cancelNodeEdit">取消</button><button class="btn btn-primary" @click="confirmNodeEdit">確認</button></div>
      </div>
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

.form-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.form-dialog {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
  min-width: 260px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}

.form-dialog h4 { margin: 0 0 12px; font-size: 14px; }

.form-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.form-row label { font-size: 12px; min-width: 70px; color: var(--color-text-muted); }
.form-row select, .form-row input { flex: 1; padding: 4px 8px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg-secondary); color: var(--color-text-primary); font-size: 12px; }

.form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
</style>

<style>
.alignment-guide-v,
.alignment-guide-h {
  position: absolute;
  pointer-events: none;
  z-index: 1000;
}
.alignment-guide-v {
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 1px dashed var(--color-accent, #0078d4);
  opacity: 0.7;
}
.alignment-guide-h {
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px dashed var(--color-accent, #0078d4);
  opacity: 0.7;
}
.vue-flow__node-gsZone {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
  pointer-events: none !important;
}
.vue-flow__node-gsZone.selected,
.vue-flow__node-gsZone.selectable,
.vue-flow__node-gsZone:hover,
.vue-flow__node-gsZone:focus,
.vue-flow__node-gsZone:focus-visible,
.vue-flow__node-gsZone.target,
.vue-flow__node-gsZone.connecting {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
}
.vue-flow__node-gsZone .vue-flow__handle {
  width: 8px;
  height: 8px;
}
.vue-flow__nodesselection-rect,
.vue-flow__selection {
  display: none !important;
}
</style>
