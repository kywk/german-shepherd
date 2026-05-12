<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEventListener } from '@vueuse/core'
import type { NetworkDiagram, LintDiagnostic, DiffState } from '@/types/index'
import { useLayout, type NodeRect } from '@/composables/useLayout'
import { useCanvasStore } from '@/stores/canvasStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import NodeRenderer from './NodeRenderer.vue'
import ConnectionRenderer from './ConnectionRenderer.vue'

const props = defineProps<{
  diagram: NetworkDiagram
  theme: 'simple' | 'icon' | 'image'
  display: 'LR' | 'TD'
  showTags: boolean
  lintDiagnostics?: LintDiagnostic[]
  nodeDiffMap?: Map<string, DiffState>
  isManualMode?: boolean
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

// ─── Manual mode: drag state ───
const canvasStore = useCanvasStore()
const workspaceStore = useWorkspaceStore()
const draggingNode = ref<string | null>(null)
const dragOffset = ref({ x: 0, y: 0 })

/** In manual mode, node positions come from canvasStore.layoutData */
const manualNodeRects = computed<Map<string, NodeRect>>(() => {
  if (!props.isManualMode) return layout.value.nodeRects
  const { w, h } = nodeSize()
  const rects = new Map<string, NodeRect>()
  const ld = canvasStore.layoutData
  for (const node of props.diagram.nodes) {
    const pos = ld.nodes[node.name]
    if (pos) {
      rects.set(node.name, { x: pos.x, y: pos.y, w, h })
    } else {
      // Fallback to auto-layout position
      const auto = layout.value.nodeRects.get(node.name)
      rects.set(node.name, auto ?? { x: 0, y: 0, w, h })
    }
  }
  return rects
})

/** In manual mode, zone rects are computed from contained node positions */
const manualZoneRects = computed(() => {
  if (!props.isManualMode) return layout.value.zoneRects
  const { w: NW, h: NH } = nodeSize()
  const PAD = 18
  const HEADER = 26
  const rects: typeof layout.value.zoneRects = []

  function computeZoneRect(zone: typeof props.diagram.zones[0], rootName: string): void {
    // Collect all nodes in this zone recursively
    const nodeNames: string[] = []
    function collectNodes(z: typeof zone) {
      for (const child of z.children) {
        if ('children' in child) collectNodes(child as typeof zone)
        else nodeNames.push((child as { name: string }).name)
      }
    }
    collectNodes(zone)

    // Get bounding box from manual positions
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const name of nodeNames) {
      const r = manualNodeRects.value.get(name)
      if (!r) continue
      if (r.x < minX) minX = r.x
      if (r.y < minY) minY = r.y
      if (r.x + r.w > maxX) maxX = r.x + r.w
      if (r.y + r.h > maxY) maxY = r.y + r.h
    }

    if (minX === Infinity) return // no nodes

    const isTopLevel = zone.depth === 0
    const zonePad = isTopLevel ? PAD + 20 : PAD

    rects.push({
      x: minX - zonePad,
      y: minY - PAD - HEADER,
      w: maxX - minX + zonePad * 2,
      h: maxY - minY + PAD * 2 + HEADER,
      depth: zone.depth,
      name: zone.name,
      rootName,
    })

    // Process sub-zones
    for (const child of zone.children) {
      if ('children' in child) computeZoneRect(child as typeof zone, rootName)
    }
  }

  for (const zone of props.diagram.zones) {
    computeZoneRect(zone, zone.name)
  }
  return rects
})

/** Convert screen coords to SVG coords */
function screenToSvg(clientX: number, clientY: number) {
  const svg = svgRef.value
  if (!svg) return { x: 0, y: 0 }
  const rect = svg.getBoundingClientRect()
  return {
    x: (clientX - rect.left - pan.value.x) / zoom.value,
    y: (clientY - rect.top - pan.value.y) / zoom.value,
  }
}

function onNodeMouseDown(e: MouseEvent, nodeName: string) {
  if (!props.isManualMode || e.button !== 0) return
  e.stopPropagation()
  const pos = screenToSvg(e.clientX, e.clientY)
  const nodeRect = manualNodeRects.value.get(nodeName)
  if (!nodeRect) return
  draggingNode.value = nodeName
  dragOffset.value = { x: pos.x - nodeRect.x, y: pos.y - nodeRect.y }
  canvasStore.selectNode(nodeName)
  canvasStore.pushUndo()
}

function onCanvasMouseMove(e: MouseEvent) {
  if (draggingZone.value) {
    const pos = screenToSvg(e.clientX, e.clientY)
    const dx = pos.x - zoneDragStart.value.x
    const dy = pos.y - zoneDragStart.value.y
    // Move all nodes in the zone by the delta
    for (const [name, start] of zoneDragNodeStarts.value) {
      canvasStore.moveNodeLive(name, start.x + dx, start.y + dy)
    }
    return
  }
  if (draggingWaypoint.value) {
    const pos = screenToSvg(e.clientX, e.clientY)
    const { connIndex, wpIndex } = draggingWaypoint.value
    const conn = canvasStore.layoutData.connections[connIndex]
    if (conn) {
      const wps = [...conn.waypoints]
      wps[wpIndex] = { x: pos.x, y: pos.y }
      canvasStore.updateConnectionWaypoints(connIndex, wps)
    }
    return
  }
  if (drawingConnection.value) {
    onConnectionDrawMove(e)
    return
  }
  if (draggingNode.value) {
    const pos = screenToSvg(e.clientX, e.clientY)
    const x = pos.x - dragOffset.value.x
    const y = pos.y - dragOffset.value.y
    canvasStore.moveNodeLive(draggingNode.value, x, y)
    return
  }
  if (!isPanning.value) return
  pan.value.x += e.clientX - lastMouse.value.x
  pan.value.y += e.clientY - lastMouse.value.y
  lastMouse.value = { x: e.clientX, y: e.clientY }
}

function onCanvasMouseUp(e: MouseEvent) {
  if (draggingZone.value) {
    canvasStore.pushUndo()
    draggingZone.value = null
    return
  }
  if (draggingWaypoint.value) {
    canvasStore.pushUndo()
    draggingWaypoint.value = null
    return
  }
  if (drawingConnection.value) {
    onConnectionDrawEnd(e)
    return
  }
  if (draggingNode.value) {
    canvasStore.pushUndo()
    draggingNode.value = null
    return
  }
  isPanning.value = false
}

function onSvgMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  // Deselect when clicking empty area
  if (props.isManualMode) canvasStore.selectNode(null)
  isPanning.value = true
  lastMouse.value = { x: e.clientX, y: e.clientY }
}

function onSvgDblClick(e: MouseEvent) {
  if (!props.isManualMode) return
  const pos = screenToSvg(e.clientX, e.clientY)
  canvasStore.addNodeAtPosition(pos.x, pos.y)
}

// ─── Connection drawing state ───
const hoveredNode = ref<string | null>(null)
const drawingConnection = ref<{ fromNode: string; fromSide: Side; currentPos: { x: number; y: number } } | null>(null)
const showConnectionForm = ref(false)
const pendingConnection = ref<{ from: string; to: string; fromSide: Side; toSide: Side } | null>(null)
const connFormData = ref({ protocol: 'HTTP', direction: 'forward' as 'forward' | 'bidirectional' | 'none', description: '' })

function getPortPositions(nodeName: string): { side: Side; x: number; y: number }[] {
  const rect = manualNodeRects.value.get(nodeName)
  if (!rect) return []
  return [
    { side: 'top', x: rect.x + rect.w / 2, y: rect.y },
    { side: 'bottom', x: rect.x + rect.w / 2, y: rect.y + rect.h },
    { side: 'left', x: rect.x, y: rect.y + rect.h / 2 },
    { side: 'right', x: rect.x + rect.w, y: rect.y + rect.h / 2 },
  ]
}

function onPortMouseDown(e: MouseEvent, nodeName: string, side: Side) {
  if (!props.isManualMode) return
  e.stopPropagation()
  const ports = getPortPositions(nodeName)
  const port = ports.find(p => p.side === side)
  if (!port) return
  drawingConnection.value = { fromNode: nodeName, fromSide: side, currentPos: { x: port.x, y: port.y } }
}

function onNodeMouseEnter(nodeName: string) {
  if (props.isManualMode && !draggingNode.value) hoveredNode.value = nodeName
}

function onNodeMouseLeave() {
  if (!drawingConnection.value) hoveredNode.value = null
}

/** Determine which port side of target node is closest to the drop point */
function closestSide(nodeName: string, pos: { x: number; y: number }): Side {
  const ports = getPortPositions(nodeName)
  let best: Side = 'left'
  let bestDist = Infinity
  for (const p of ports) {
    const d = Math.hypot(p.x - pos.x, p.y - pos.y)
    if (d < bestDist) { bestDist = d; best = p.side }
  }
  return best
}

/** Check if position is over a node (for connection drop target) */
function nodeAtPosition(pos: { x: number; y: number }): string | null {
  for (const [name, rect] of manualNodeRects.value) {
    if (pos.x >= rect.x && pos.x <= rect.x + rect.w && pos.y >= rect.y && pos.y <= rect.y + rect.h) {
      return name
    }
  }
  return null
}

function onConnectionDrawMove(e: MouseEvent) {
  if (!drawingConnection.value) return
  drawingConnection.value.currentPos = screenToSvg(e.clientX, e.clientY)
}

function onConnectionDrawEnd(e: MouseEvent) {
  if (!drawingConnection.value) return
  const pos = screenToSvg(e.clientX, e.clientY)
  const targetNode = nodeAtPosition(pos)

  if (targetNode && targetNode !== drawingConnection.value.fromNode) {
    const toSide = closestSide(targetNode, pos)
    pendingConnection.value = {
      from: drawingConnection.value.fromNode,
      to: targetNode,
      fromSide: drawingConnection.value.fromSide,
      toSide,
    }
    showConnectionForm.value = true
  }
  drawingConnection.value = null
}

function confirmConnection() {
  if (!pendingConnection.value) return
  const { from, to, fromSide, toSide } = pendingConnection.value
  const { protocol, direction, description } = connFormData.value

  // Add connection to markdown body
  const rawText = workspaceStore.currentRawText
  const arrow = direction === 'forward' ? '->' : direction === 'bidirectional' ? '<->' : '--'
  const connLine = description
    ? `${from} ${arrow} ${to}: ${protocol}, ${description}`
    : `${from} ${arrow} ${to}: ${protocol}`

  // Insert connection line before the code block
  const lines = rawText.split('\n')
  // Find the code block start (last ```)
  let codeBlockStart = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '```') {
      codeBlockStart = i
      // Find opening
      for (let j = i - 1; j >= 0; j--) {
        if (lines[j].trim() === '```') { codeBlockStart = j; break }
      }
      break
    }
  }

  const insertIdx = codeBlockStart > 0 ? codeBlockStart : lines.length
  lines.splice(insertIdx, 0, connLine)

  canvasStore.pushUndo()
  workspaceStore.updateCurrentRawText(lines.join('\n'))

  // Add to layout block
  canvasStore.addConnection({ from, to, fromSide, toSide, waypoints: [] })

  showConnectionForm.value = false
  pendingConnection.value = null
  connFormData.value = { protocol: 'HTTP', direction: 'forward', description: '' }
}

function cancelConnection() {
  showConnectionForm.value = false
  pendingConnection.value = null
}

// ─── Waypoint editing state ───
const draggingWaypoint = ref<{ connIndex: number; wpIndex: number } | null>(null)

function onWaypointMouseDown(e: MouseEvent, connIndex: number, wpIndex: number) {
  e.stopPropagation()
  draggingWaypoint.value = { connIndex, wpIndex }
  canvasStore.pushUndo()
}

function onWaypointDblClick(e: MouseEvent, connIndex: number, wpIndex: number) {
  // Remove waypoint on double-click
  e.stopPropagation()
  const conn = canvasStore.layoutData.connections[connIndex]
  if (!conn) return
  const wps = conn.waypoints.filter((_, i) => i !== wpIndex)
  canvasStore.updateConnectionWaypoints(connIndex, wps)
}

function onConnectionDblClick(e: MouseEvent, connIndex: number) {
  if (!props.isManualMode) return
  e.stopPropagation()
  // Add waypoint at click position
  const pos = screenToSvg(e.clientX, e.clientY)
  const conn = canvasStore.layoutData.connections[connIndex]
  if (!conn) return
  // Insert waypoint — find the segment closest to click and insert there
  const wps = [...conn.waypoints]
  // Simple: append at end (between existing waypoints or at start)
  wps.push({ x: pos.x, y: pos.y })
  canvasStore.updateConnectionWaypoints(connIndex, wps)
}

/** Add a waypoint at the midpoint of the selected connection and start dragging it */
function addMidpointWaypoint(e: MouseEvent) {
  const idx = canvasStore.selectedConnectionIndex
  if (idx === null) return
  const pm = manualPortMap.value[idx]
  if (!pm) return
  const midX = (pm.from.x + pm.to.x) / 2
  const midY = (pm.from.y + pm.to.y) / 2
  canvasStore.pushUndo()
  canvasStore.updateConnectionWaypoints(idx, [{ x: midX, y: midY }])
  // Start dragging the new waypoint immediately
  draggingWaypoint.value = { connIndex: idx, wpIndex: 0 }
}

const SIDES: Side[] = ['right', 'bottom', 'left', 'top']

/** Cycle the from or to port side of the selected connection */
function cyclePortSide(endpoint: 'from' | 'to') {
  const idx = canvasStore.selectedConnectionIndex
  if (idx === null) return
  const conn = canvasStore.layoutData.connections[idx]
  if (!conn) return
  const currentSide = endpoint === 'from' ? conn.fromSide : conn.toSide
  const nextSide = SIDES[(SIDES.indexOf(currentSide) + 1) % SIDES.length]
  if (endpoint === 'from') {
    canvasStore.updateConnectionSides(idx, nextSide, conn.toSide)
  } else {
    canvasStore.updateConnectionSides(idx, conn.fromSide, nextSide)
  }
}

// ─── Zone/Group drag ───
const draggingZone = ref<string | null>(null)
const zoneDragStart = ref({ x: 0, y: 0 })
const zoneDragNodeStarts = ref<Map<string, { x: number; y: number }>>(new Map())

/** Get all node names belonging to a zone (recursively) */
function getZoneNodeNames(zoneName: string): string[] {
  const names: string[] = []
  function walk(zones: typeof props.diagram.zones) {
    for (const z of zones) {
      if (z.name === zoneName) {
        function collect(zone: typeof z) {
          for (const child of zone.children) {
            if ('children' in child) collect(child as typeof z)
            else names.push((child as { name: string }).name)
          }
        }
        collect(z)
        return
      }
      // Check sub-zones
      const subs = z.children.filter(c => 'children' in c) as typeof props.diagram.zones
      walk(subs)
    }
  }
  walk(props.diagram.zones)
  return names
}

function onZoneMouseDown(e: MouseEvent, zoneName: string) {
  if (!props.isManualMode || e.button !== 0) return
  e.stopPropagation()
  const pos = screenToSvg(e.clientX, e.clientY)
  draggingZone.value = zoneName
  zoneDragStart.value = pos
  // Record starting positions of all nodes in this zone
  const nodeNames = getZoneNodeNames(zoneName)
  const starts = new Map<string, { x: number; y: number }>()
  for (const name of nodeNames) {
    const rect = manualNodeRects.value.get(name)
    if (rect) starts.set(name, { x: rect.x, y: rect.y })
  }
  zoneDragNodeStarts.value = starts
  canvasStore.pushUndo()
}

/** Get waypoints for a connection in manual mode */
function getConnectionWaypoints(connIndex: number): { x: number; y: number }[] {
  if (!props.isManualMode) return []
  const conn = canvasStore.layoutData.connections[connIndex]
  return conn?.waypoints ?? []
}

// ─── Node edit form ───
const showNodeForm = ref(false)
const nodeFormData = ref({ name: '', type: 'AP Server', note: '', tags: '' })

function openNodeForm() {
  const name = canvasStore.selectedNodeName
  if (!name) return
  const node = props.diagram.nodes.find(n => n.name === name)
  if (!node) return
  nodeFormData.value = {
    name: node.name,
    type: node.type,
    note: node.note ?? '',
    tags: node.tags?.join(', ') ?? '',
  }
  showNodeForm.value = true
}

function confirmNodeEdit() {
  const oldName = canvasStore.selectedNodeName
  if (!oldName) return

  const { name: newName, type, note, tags } = nodeFormData.value
  const node = props.diagram.nodes.find(n => n.name === oldName)
  if (!node) return

  // Rebuild the node line
  const tagStr = tags.trim() ? ' ' + tags.trim().split(/[,\s]+/).map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : ''
  const noteStr = note.trim() ? `, ${note.trim()}` : ''
  const newLine = `  - ${newName.trim()}, ${type}${noteStr}${tagStr}`

  // Replace in markdown
  const rawText = workspaceStore.currentRawText
  const lines = rawText.split('\n')
  if (node.line > 0 && node.line <= lines.length) {
    lines[node.line - 1] = newLine
  }

  canvasStore.pushUndo()
  workspaceStore.updateCurrentRawText(lines.join('\n'))

  // Handle rename in layout
  if (newName.trim() !== oldName) {
    canvasStore.renameNode(oldName, newName.trim())
    canvasStore.selectNode(newName.trim())
  }

  showNodeForm.value = false
}

function cancelNodeEdit() {
  showNodeForm.value = false
}

/** Double-click node to open edit form */
function onNodeDblClick(e: MouseEvent, nodeName: string) {
  if (!props.isManualMode) return
  e.stopPropagation()
  canvasStore.selectNode(nodeName)
  openNodeForm()
}

// ---- Port assignment ----
type Side = 'top' | 'bottom' | 'left' | 'right'

/** Maps nodeName → top-level zone name, used for zone-aware port selection */
const nodeTopZoneMap = computed(() => layout.value.nodeZoneMap)

/**
 * Zone-aware port selection:
 * - Same top-level zone → strongly prefer vertical ports (bottom/top)
 * - Cross-zone → prefer horizontal (right/left), with slightly relaxed threshold
 */
function chooseSide(
  from: NodeRect, to: NodeRect,
  fromName?: string, toName?: string
): { fromSide: Side; toSide: Side } {
  const dx = (to.x + to.w / 2) - (from.x + from.w / 2)
  const dy = (to.y + to.h / 2) - (from.y + from.h / 2)

  // Resolve zone for both endpoints (node or sub-zone)
  const zoneMap = nodeTopZoneMap.value
  const zrList = layout.value.zoneRects
  function resolveZone(name?: string): string | undefined {
    if (!name) return undefined
    const fromNode = zoneMap.get(name)
    if (fromNode) return fromNode
    // Sub-zone endpoint: look up rootName from zoneRects
    return zrList.find(z => z.name === name)?.rootName
  }

  const fz = resolveZone(fromName)
  const tz = resolveZone(toName)
  const sameZone = fz && tz && fz === tz

  if (sameZone) {
    // Same zone: prefer vertical unless nearly horizontal (|dx| >> |dy|)
    if (Math.abs(dx) >= Math.abs(dy) * 2.5) {
      return dx >= 0
        ? { fromSide: 'right', toSide: 'left' }
        : { fromSide: 'left', toSide: 'right' }
    }
    return dy >= 0
      ? { fromSide: 'bottom', toSide: 'top' }
      : { fromSide: 'top', toSide: 'bottom' }
  }

  // Cross-zone: prefer horizontal only when clearly going sideways (|dx| >> |dy|)
  if (Math.abs(dx) >= Math.abs(dy) * 0.85) {
    return dx >= 0
      ? { fromSide: 'right', toSide: 'left' }
      : { fromSide: 'left', toSide: 'right' }
  }
  return dy >= 0
    ? { fromSide: 'bottom', toSide: 'top' }
    : { fromSide: 'top', toSide: 'bottom' }
}

interface PortPoint { x: number; y: number }

// Combined rect map: nodes + sub-zones (depth > 0) as connection endpoints / obstacle rects
const allRects = computed(() => {
  const rects = manualNodeRects.value
  const combined = new Map<string, NodeRect>(rects)
  for (const zr of layout.value.zoneRects) {
    if (zr.depth > 0 && !combined.has(zr.name)) {
      combined.set(zr.name, { x: zr.x, y: zr.y, w: zr.w, h: zr.h })
    }
  }
  return combined
})

/**
 * Compute port positions for all connections.
 * Ports on each node+side are sorted by the OTHER node's position
 * (so the top port connects to the topmost target, etc.)
 */
const portMap = computed(() => {
  const allRectsVal = allRects.value
  const conns = props.diagram.connections

  // Step 1: determine sides for each connection (zone-aware)
  const connSides: { fromSide: Side; toSide: Side }[] = []
  for (let i = 0; i < conns.length; i++) {
    const c = conns[i]
    const fromR = allRectsVal.get(c.from)
    const toR = allRectsVal.get(c.to)
    if (!fromR || !toR) { connSides.push({ fromSide: 'right', toSide: 'left' }); continue }
    connSides.push(chooseSide(fromR, toR, c.from, c.to))
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
    const r = allRectsVal.get(otherName)
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
    const fromR = allRectsVal.get(c.from)
    const toR = allRectsVal.get(c.to)
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

/** In manual mode, compute port positions from layout block's fromSide/toSide */
const manualPortMap = computed(() => {
  if (!props.isManualMode) return portMap.value
  const ld = canvasStore.layoutData
  const conns = props.diagram.connections
  const result: { from: { x: number; y: number }; to: { x: number; y: number }; fromSide: Side }[] = []

  for (let i = 0; i < conns.length; i++) {
    const c = conns[i]
    const fromR = manualNodeRects.value.get(c.from)
    const toR = manualNodeRects.value.get(c.to)
    if (!fromR || !toR) {
      result.push({ from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, fromSide: 'right' })
      continue
    }

    // Use layout block sides if available, otherwise auto-calculate
    const layoutConn = ld.connections[i]
    let fromSide: Side, toSide: Side
    if (layoutConn) {
      fromSide = layoutConn.fromSide
      toSide = layoutConn.toSide
    } else {
      const auto = portMap.value[i]
      fromSide = auto?.fromSide ?? 'right'
      // Infer toSide from auto portMap
      const dx = (toR.x + toR.w / 2) - (fromR.x + fromR.w / 2)
      toSide = dx >= 0 ? 'left' : 'right'
    }

    // Compute port position at center of the side
    function portCenter(rect: NodeRect, side: Side): { x: number; y: number } {
      switch (side) {
        case 'left': return { x: rect.x, y: rect.y + rect.h / 2 }
        case 'right': return { x: rect.x + rect.w, y: rect.y + rect.h / 2 }
        case 'top': return { x: rect.x + rect.w / 2, y: rect.y }
        case 'bottom': return { x: rect.x + rect.w / 2, y: rect.y + rect.h }
      }
    }

    result.push({
      from: portCenter(fromR, fromSide),
      to: portCenter(toR, toSide),
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
    @mousemove="onCanvasMouseMove"
    @mouseup="onCanvasMouseUp"
    @mouseleave="onCanvasMouseUp"
  >
    <svg
      v-if="diagram.nodes.length > 0"
      ref="svgRef"
      width="100%"
      height="100%"
      @mousedown="onSvgMouseDown"
      @dblclick="onSvgDblClick"
      :style="{ cursor: draggingNode ? 'grabbing' : (isPanning ? 'grabbing' : 'grab') }"
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
          <g v-for="zr in manualZoneRects" :key="zr.name + zr.x + zr.y">
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
                :style="{ cursor: isManualMode ? 'move' : 'default' }"
                @mousedown.stop="(e: MouseEvent) => onZoneMouseDown(e, zr.name)"
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
                :style="{ cursor: isManualMode ? 'move' : 'default' }"
                @mousedown.stop="(e: MouseEvent) => onZoneMouseDown(e, zr.name)"
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

        <!-- Connections (rendered after nodes for click priority in manual mode) -->
        <g class="connections" :style="{ pointerEvents: isManualMode ? 'none' : 'auto' }">
          <ConnectionRenderer
            v-for="(conn, i) in diagram.connections"
            :key="`${conn.from}-${conn.to}-${conn.line}`"
            :connection="conn"
            :from-port="manualPortMap[i]?.from ?? { x: 0, y: 0 }"
            :to-port="manualPortMap[i]?.to ?? { x: 0, y: 0 }"
            :from-side="manualPortMap[i]?.fromSide ?? 'right'"
            :all-node-rects="allRects"
            :is-selected="canvasStore.selectedConnectionIndex === i"
            :waypoints="isManualMode ? getConnectionWaypoints(i) : undefined"
            @click="() => isManualMode && canvasStore.selectConnection(i)"
            @dblclick.stop="(e: MouseEvent) => onConnectionDblClick(e, i)"
          />
        </g>

        <!-- Nodes -->
        <g class="nodes">
          <g
            v-for="node in diagram.nodes"
            :key="node.name"
            @mousedown="(e: MouseEvent) => onNodeMouseDown(e, node.name)"
            @mouseenter="() => onNodeMouseEnter(node.name)"
            @mouseleave="onNodeMouseLeave"
            @dblclick.stop="(e: MouseEvent) => onNodeDblClick(e, node.name)"
            :style="{ cursor: isManualMode ? 'move' : 'pointer' }"
          >
            <NodeRenderer
              :node="node"
              :x="manualNodeRects.get(node.name)?.x ?? 0"
              :y="manualNodeRects.get(node.name)?.y ?? 0"
              :w="nodeSize().w"
              :h="nodeSize().h"
              :theme="theme"
              :show-tags="showTags"
              :is-lint-warning="lintWarnNodes.has(node.name)"
              :diff-state="nodeDiffMap?.get(node.name)"
              :is-selected="canvasStore.selectedNodeName === node.name"
            />
          </g>
        </g>

        <!-- Connection hit areas (on top of nodes for click priority in manual mode) -->
        <g v-if="isManualMode" class="connection-hit-areas">
          <ConnectionRenderer
            v-for="(conn, i) in diagram.connections"
            :key="`hit-${conn.from}-${conn.to}-${conn.line}`"
            :connection="conn"
            :from-port="manualPortMap[i]?.from ?? { x: 0, y: 0 }"
            :to-port="manualPortMap[i]?.to ?? { x: 0, y: 0 }"
            :from-side="manualPortMap[i]?.fromSide ?? 'right'"
            :all-node-rects="allRects"
            :is-selected="canvasStore.selectedConnectionIndex === i"
            :waypoints="getConnectionWaypoints(i)"
            :hit-area-only="true"
            @click="() => canvasStore.selectConnection(i)"
            @dblclick.stop="(e: MouseEvent) => onConnectionDblClick(e, i)"
          />
        </g>

        <!-- Waypoint control points (manual mode, selected connection) -->
        <g v-if="isManualMode && canvasStore.selectedConnectionIndex !== null" class="waypoints">
          <!-- Existing waypoints -->
          <circle
            v-for="(wp, wpIdx) in getConnectionWaypoints(canvasStore.selectedConnectionIndex)"
            :key="wpIdx"
            :cx="wp.x"
            :cy="wp.y"
            r="5"
            fill="var(--color-accent)"
            stroke="white"
            stroke-width="1.5"
            style="cursor: move"
            @mousedown.stop="(e: MouseEvent) => onWaypointMouseDown(e, canvasStore.selectedConnectionIndex!, wpIdx)"
            @dblclick.stop="(e: MouseEvent) => onWaypointDblClick(e, canvasStore.selectedConnectionIndex!, wpIdx)"
          />
          <!-- Midpoint handle when no waypoints (hint to add one) -->
          <circle
            v-if="getConnectionWaypoints(canvasStore.selectedConnectionIndex).length === 0"
            :cx="((manualPortMap[canvasStore.selectedConnectionIndex]?.from.x ?? 0) + (manualPortMap[canvasStore.selectedConnectionIndex]?.to.x ?? 0)) / 2"
            :cy="((manualPortMap[canvasStore.selectedConnectionIndex]?.from.y ?? 0) + (manualPortMap[canvasStore.selectedConnectionIndex]?.to.y ?? 0)) / 2"
            r="6"
            fill="var(--color-accent)"
            fill-opacity="0.5"
            stroke="var(--color-accent)"
            stroke-width="1.5"
            stroke-dasharray="3,2"
            style="cursor: pointer"
            @mousedown.stop="(e: MouseEvent) => addMidpointWaypoint(e)"
          />
          <!-- Instruction text -->
          <text
            :x="((manualPortMap[canvasStore.selectedConnectionIndex]?.from.x ?? 0) + (manualPortMap[canvasStore.selectedConnectionIndex]?.to.x ?? 0)) / 2"
            :y="((manualPortMap[canvasStore.selectedConnectionIndex]?.from.y ?? 0) + (manualPortMap[canvasStore.selectedConnectionIndex]?.to.y ?? 0)) / 2 - 14"
            text-anchor="middle"
            font-size="9"
            fill="var(--color-accent)"
            style="pointer-events: none"
          >{{ getConnectionWaypoints(canvasStore.selectedConnectionIndex).length === 0 ? '拖拉新增彎折點 · 點擊端點切換方向' : '雙擊刪除彎折點 · 點擊端點切換方向 · Delete 刪除連線' }}</text>

          <!-- From port handle -->
          <g @mousedown.stop="() => cyclePortSide('from')">
            <circle
              :cx="manualPortMap[canvasStore.selectedConnectionIndex]?.from.x ?? 0"
              :cy="manualPortMap[canvasStore.selectedConnectionIndex]?.from.y ?? 0"
              r="7"
              fill="var(--color-accent)"
              fill-opacity="0.3"
              stroke="var(--color-accent)"
              stroke-width="2"
              style="cursor: pointer"
            />
            <text
              :x="(manualPortMap[canvasStore.selectedConnectionIndex]?.from.x ?? 0)"
              :y="(manualPortMap[canvasStore.selectedConnectionIndex]?.from.y ?? 0) + 1"
              text-anchor="middle"
              dominant-baseline="middle"
              font-size="8"
              font-weight="bold"
              fill="var(--color-accent)"
              style="pointer-events: none"
            >S</text>
          </g>

          <!-- To port handle -->
          <g @mousedown.stop="() => cyclePortSide('to')">
            <circle
              :cx="manualPortMap[canvasStore.selectedConnectionIndex]?.to.x ?? 0"
              :cy="manualPortMap[canvasStore.selectedConnectionIndex]?.to.y ?? 0"
              r="7"
              fill="var(--color-accent)"
              fill-opacity="0.3"
              stroke="var(--color-accent)"
              stroke-width="2"
              style="cursor: pointer"
            />
            <text
              :x="(manualPortMap[canvasStore.selectedConnectionIndex]?.to.x ?? 0)"
              :y="(manualPortMap[canvasStore.selectedConnectionIndex]?.to.y ?? 0) + 1"
              text-anchor="middle"
              dominant-baseline="middle"
              font-size="8"
              font-weight="bold"
              fill="var(--color-accent)"
              style="pointer-events: none"
            >E</text>
          </g>
        </g>

        <!-- Port indicators (manual mode, hovered node) -->
        <g v-if="isManualMode && hoveredNode && !draggingNode" class="port-indicators">
          <circle
            v-for="port in getPortPositions(hoveredNode)"
            :key="port.side"
            :cx="port.x"
            :cy="port.y"
            r="5"
            fill="var(--color-accent)"
            fill-opacity="0.8"
            stroke="white"
            stroke-width="1.5"
            style="cursor: crosshair"
            @mousedown.stop="(e: MouseEvent) => onPortMouseDown(e, hoveredNode!, port.side)"
          />
        </g>

        <!-- Drawing connection line -->
        <g v-if="drawingConnection" class="drawing-connection">
          <line
            :x1="getPortPositions(drawingConnection.fromNode).find(p => p.side === drawingConnection!.fromSide)?.x ?? 0"
            :y1="getPortPositions(drawingConnection.fromNode).find(p => p.side === drawingConnection!.fromSide)?.y ?? 0"
            :x2="drawingConnection.currentPos.x"
            :y2="drawingConnection.currentPos.y"
            stroke="var(--color-accent)"
            stroke-width="2"
            stroke-dasharray="6,3"
          />
        </g>
      </g>
    </svg>

    <div v-else class="empty-state">
      <p>🐕 請在左側編輯區輸入架構圖語法...</p>
    </div>

    <!-- Connection form dialog -->
    <div v-if="showConnectionForm" class="conn-form-overlay" @click.self="cancelConnection">
      <div class="conn-form">
        <h4>新增連線</h4>
        <div class="conn-form-row">
          <label>Protocol</label>
          <select v-model="connFormData.protocol">
            <option v-for="p in ['HTTP','SOAP','WebSocket','gRPC','RFC','FTP','Socket','Others']" :key="p" :value="p">{{ p }}</option>
          </select>
        </div>
        <div class="conn-form-row">
          <label>Direction</label>
          <select v-model="connFormData.direction">
            <option value="forward">→ Forward</option>
            <option value="bidirectional">↔ Bidirectional</option>
            <option value="none">— None</option>
          </select>
        </div>
        <div class="conn-form-row">
          <label>Description</label>
          <input v-model="connFormData.description" placeholder="(optional)" @keydown.enter="confirmConnection" />
        </div>
        <div class="conn-form-actions">
          <button class="btn btn-ghost" @click="cancelConnection">取消</button>
          <button class="btn btn-primary" @click="confirmConnection">確認</button>
        </div>
      </div>
    </div>

    <!-- Node edit form dialog -->
    <div v-if="showNodeForm" class="conn-form-overlay" @click.self="cancelNodeEdit">
      <div class="conn-form">
        <h4>編輯節點</h4>
        <div class="conn-form-row">
          <label>Name</label>
          <input v-model="nodeFormData.name" @keydown.enter="confirmNodeEdit" />
        </div>
        <div class="conn-form-row">
          <label>Type</label>
          <select v-model="nodeFormData.type">
            <option v-for="t in ['App','Web','Firewall','WAF','F5','Storage','AP Server','Web Server','SAP','Database']" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <div class="conn-form-row">
          <label>Note</label>
          <input v-model="nodeFormData.note" placeholder="(optional)" />
        </div>
        <div class="conn-form-row">
          <label>Tags</label>
          <input v-model="nodeFormData.tags" placeholder="#tag1, #tag2" />
        </div>
        <div class="conn-form-actions">
          <button class="btn btn-ghost" @click="cancelNodeEdit">取消</button>
          <button class="btn btn-primary" @click="confirmNodeEdit">確認</button>
        </div>
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

.conn-form-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.conn-form {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
  min-width: 260px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}

.conn-form h4 { margin: 0 0 12px; font-size: 14px; }

.conn-form-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.conn-form-row label {
  font-size: 12px;
  min-width: 70px;
  color: var(--color-text-muted);
}

.conn-form-row select,
.conn-form-row input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: 12px;
}

.conn-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>
