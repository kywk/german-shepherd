import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWorkspaceStore } from './workspaceStore'
import { useDiagramStore } from './diagramStore'
import { useUndoStack } from '@/composables/useUndoStack'
import {
  parseLayout,
  updateMarkdownLayout,
  removeLayoutBlock,
  emptyLayout,
  type LayoutData,
  type LayoutConnection,
  type Side,
} from '@/parser/layoutParser'
import { useLayout } from '@/composables/useLayout'

export const useCanvasStore = defineStore('canvas', () => {
  const workspaceStore = useWorkspaceStore()
  const diagramStore = useDiagramStore()
  const undoStack = useUndoStack()

  // ─── State ───
  const isManualMode = ref(false)
  const selectedNodeName = ref<string | null>(null)
  const selectedConnectionIndex = ref<number | null>(null)

  // ─── Derived ───
  const layoutData = computed<LayoutData>(() => {
    if (!isManualMode.value) return emptyLayout()
    return parseLayout(workspaceStore.currentRawText) ?? emptyLayout()
  })

  // ─── Undo ───
  function pushUndo() {
    undoStack.push(workspaceStore.currentRawText)
  }

  function undo() {
    const snapshot = undoStack.undo()
    if (snapshot !== null) workspaceStore.updateCurrentRawText(snapshot)
  }

  function redo() {
    const snapshot = undoStack.redo()
    if (snapshot !== null) workspaceStore.updateCurrentRawText(snapshot)
  }

  // ─── Mode switching ───
  function enterManualMode() {
    if (isManualMode.value) return
    // Snapshot current auto-layout positions into code block
    const diagram = diagramStore.parsedDiagram
    const autoLayout = useLayout(() => diagram, () => diagram.meta.display, () => diagram.meta.theme)
    const nodeRects = autoLayout.value.nodeRects

    const data = emptyLayout()
    for (const [name, rect] of nodeRects) {
      data.nodes[name] = { x: rect.x, y: rect.y }
    }

    // Initialize connections with default sides (no waypoints)
    for (const conn of diagram.connections) {
      const fromR = nodeRects.get(conn.from)
      const toR = nodeRects.get(conn.to)
      if (fromR && toR) {
        const dx = (toR.x + toR.w / 2) - (fromR.x + fromR.w / 2)
        const fromSide: 'left' | 'right' = dx >= 0 ? 'right' : 'left'
        const toSide: 'left' | 'right' = dx >= 0 ? 'left' : 'right'
        data.connections.push({ from: conn.from, to: conn.to, fromSide, toSide, waypoints: [] })
      }
    }

    pushUndo()
    const updated = updateMarkdownLayout(workspaceStore.currentRawText, data)
    workspaceStore.updateCurrentRawText(updated)
    pushUndo()
    isManualMode.value = true
  }

  function exitManualMode() {
    if (!isManualMode.value) return
    pushUndo()
    const cleaned = removeLayoutBlock(workspaceStore.currentRawText)
    workspaceStore.updateCurrentRawText(cleaned)
    pushUndo()
    isManualMode.value = false
    selectedNodeName.value = null
    selectedConnectionIndex.value = null
  }

  // ─── Node actions ───
  function moveNode(name: string, x: number, y: number) {
    const data = { ...layoutData.value, nodes: { ...layoutData.value.nodes } }
    data.nodes[name] = { x, y }
    commitLayout(data)
  }

  /** Move node without pushing undo (for live dragging). Call pushUndo before drag starts. */
  function moveNodeLive(name: string, x: number, y: number) {
    const data = { ...layoutData.value, nodes: { ...layoutData.value.nodes } }
    data.nodes[name] = { x, y }
    const updated = updateMarkdownLayout(workspaceStore.currentRawText, data)
    workspaceStore.updateCurrentRawText(updated)
  }

  function addNode(name: string, x: number, y: number) {
    const data = { ...layoutData.value, nodes: { ...layoutData.value.nodes } }
    data.nodes[name] = { x, y }
    commitLayout(data)
  }

  /**
   * Add a new node at a canvas position.
   * Determines zone from position, inserts node definition into markdown body,
   * and adds coordinates to layout block.
   */
  function addNodeAtPosition(x: number, y: number) {
    const diagram = diagramStore.parsedDiagram
    // Generate unique name
    let name = 'New Node'
    let i = 2
    const existingNames = new Set(diagram.nodes.map(n => n.name))
    while (existingNames.has(name)) { name = `New Node ${i++}` }

    // Determine zone from position using layout zone rects
    const autoLayout = useLayout(() => diagram, () => diagram.meta.display, () => diagram.meta.theme)
    let targetZone = diagram.zones[0]?.name ?? ''
    for (const zr of autoLayout.value.zoneRects) {
      if (zr.depth === 0 && x >= zr.x && x <= zr.x + zr.w) {
        targetZone = zr.name
        break
      }
    }

    // Insert node line into markdown body (after the zone's last node)
    const rawText = workspaceStore.currentRawText
    const lines = rawText.split('\n')
    let insertIdx = -1
    let inTargetZone = false
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      if (trimmed === `${targetZone}:`) { inTargetZone = true; continue }
      if (inTargetZone) {
        // Still in zone if indented or sub-zone
        if (lines[i].match(/^\s/) || trimmed === '') continue
        if (trimmed.endsWith(':') && !trimmed.startsWith('-')) continue
        // Reached next top-level zone or connections
        insertIdx = i
        break
      }
    }
    if (insertIdx === -1) {
      // Find the line before connections or code block
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/->|<->|--/) && !lines[i].trim().startsWith('-')) {
          insertIdx = i
          break
        }
      }
      if (insertIdx === -1) insertIdx = lines.length
    }

    const nodeLine = `  - ${name}, AP Server`
    lines.splice(insertIdx, 0, nodeLine)
    const newText = lines.join('\n')

    // Update layout data with new node position
    pushUndo()
    workspaceStore.updateCurrentRawText(newText)
    // Re-parse and add to layout
    const data = { ...(parseLayout(workspaceStore.currentRawText) ?? emptyLayout()) }
    data.nodes = { ...data.nodes, [name]: { x, y } }
    const updated = updateMarkdownLayout(workspaceStore.currentRawText, data)
    workspaceStore.updateCurrentRawText(updated)
    pushUndo()

    selectedNodeName.value = name
    return name
  }

  function removeNode(name: string) {
    const data = { ...layoutData.value, nodes: { ...layoutData.value.nodes }, connections: [...layoutData.value.connections] }
    delete data.nodes[name]
    data.connections = data.connections.filter(c => c.from !== name && c.to !== name)
    commitLayout(data)
  }

  function renameNode(oldName: string, newName: string) {
    const data = { ...layoutData.value, nodes: { ...layoutData.value.nodes }, connections: [...layoutData.value.connections] }
    if (data.nodes[oldName]) {
      data.nodes[newName] = data.nodes[oldName]
      delete data.nodes[oldName]
    }
    data.connections = data.connections.map(c => ({
      ...c,
      from: c.from === oldName ? newName : c.from,
      to: c.to === oldName ? newName : c.to,
    }))
    commitLayout(data)
  }

  // ─── Connection actions ───
  function addConnection(conn: LayoutConnection) {
    const data = { ...layoutData.value, connections: [...layoutData.value.connections, conn] }
    commitLayout(data)
  }

  function removeConnection(index: number) {
    const diagram = diagramStore.parsedDiagram
    const conn = diagram.connections[index]
    if (!conn) return

    // Remove connection line from markdown body
    const rawText = workspaceStore.currentRawText
    const lines = rawText.split('\n')
    if (conn.line > 0 && conn.line <= lines.length) {
      lines.splice(conn.line - 1, 1)
    }
    pushUndo()
    workspaceStore.updateCurrentRawText(lines.join('\n'))

    // Remove from layout block
    const data = { ...layoutData.value, connections: layoutData.value.connections.filter((_, i) => i !== index) }
    const updated = updateMarkdownLayout(workspaceStore.currentRawText, data)
    workspaceStore.updateCurrentRawText(updated)
    pushUndo()
    selectedConnectionIndex.value = null
  }

  function updateConnectionWaypoints(index: number, waypoints: { x: number; y: number }[]) {
    const data = { ...layoutData.value, connections: layoutData.value.connections.map((c, i) => i === index ? { ...c, waypoints } : c) }
    commitLayout(data)
  }

  function updateConnectionSides(index: number, fromSide: Side, toSide: Side) {
    const data = { ...layoutData.value, connections: layoutData.value.connections.map((c, i) => i === index ? { ...c, fromSide, toSide } : c) }
    commitLayout(data)
  }

  // ─── Selection ───
  function selectNode(name: string | null) {
    selectedNodeName.value = name
    selectedConnectionIndex.value = null
  }

  function selectConnection(index: number | null) {
    selectedConnectionIndex.value = index
    selectedNodeName.value = null
  }

  // ─── Internal ───
  function commitLayout(data: LayoutData) {
    pushUndo()
    const updated = updateMarkdownLayout(workspaceStore.currentRawText, data)
    workspaceStore.updateCurrentRawText(updated)
  }

  // Initialize undo stack when workspace loads
  function initUndo() {
    undoStack.reset(workspaceStore.currentRawText)
  }

  /**
   * Sync layout block with current diagram state.
   * Called when markdown is edited directly (left panel).
   * Handles: node rename detection, new nodes get default position, deleted nodes removed.
   */
  function syncLayoutWithDiagram() {
    if (!isManualMode.value) return
    const currentLayout = parseLayout(workspaceStore.currentRawText)
    if (!currentLayout) return

    const diagram = diagramStore.parsedDiagram
    const diagramNodeNames = new Set(diagram.nodes.map(n => n.name))
    const layoutNodeNames = new Set(Object.keys(currentLayout.nodes))

    let changed = false
    const newNodes = { ...currentLayout.nodes }

    // Remove nodes no longer in diagram
    for (const name of layoutNodeNames) {
      if (!diagramNodeNames.has(name)) {
        delete newNodes[name]
        changed = true
      }
    }

    // Add new nodes with default position
    for (const name of diagramNodeNames) {
      if (!layoutNodeNames.has(name)) {
        // Place at center-ish position
        const existingPositions = Object.values(newNodes)
        const avgX = existingPositions.length > 0 ? existingPositions.reduce((s, n) => s + n.x, 0) / existingPositions.length : 200
        const avgY = existingPositions.length > 0 ? existingPositions.reduce((s, n) => s + n.y, 0) / existingPositions.length : 200
        newNodes[name] = { x: avgX + 50, y: avgY + 50 }
        changed = true
      }
    }

    // Update connection endpoints if nodes were renamed
    // (Detect rename: if exactly one node was removed and one added, treat as rename)
    const removed = [...layoutNodeNames].filter(n => !diagramNodeNames.has(n))
    const added = [...diagramNodeNames].filter(n => !layoutNodeNames.has(n))
    let newConns = [...currentLayout.connections]
    if (removed.length === 1 && added.length === 1) {
      const oldName = removed[0]
      const newName = added[0]
      // Transfer position
      if (currentLayout.nodes[oldName]) {
        newNodes[newName] = currentLayout.nodes[oldName]
        delete newNodes[oldName]
      }
      // Update connections
      newConns = newConns.map(c => ({
        ...c,
        from: c.from === oldName ? newName : c.from,
        to: c.to === oldName ? newName : c.to,
      }))
      changed = true
    }

    if (changed) {
      const data: LayoutData = { nodes: newNodes, connections: newConns }
      const updated = updateMarkdownLayout(workspaceStore.currentRawText, data)
      workspaceStore.updateCurrentRawText(updated)
    }
  }

  return {
    // State
    isManualMode,
    selectedNodeName,
    selectedConnectionIndex,
    layoutData,
    // Undo
    canUndo: undoStack.canUndo,
    canRedo: undoStack.canRedo,
    undo,
    redo,
    pushUndo,
    initUndo,
    // Mode
    enterManualMode,
    exitManualMode,
    // Node actions
    moveNode,
    moveNodeLive,
    addNode,
    addNodeAtPosition,
    removeNode,
    renameNode,
    // Connection actions
    addConnection,
    removeConnection,
    updateConnectionWaypoints,
    updateConnectionSides,
    // Selection
    selectNode,
    selectConnection,
    // Sync
    syncLayoutWithDiagram,
  }
})
