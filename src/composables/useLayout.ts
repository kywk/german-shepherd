import { computed } from 'vue'
import type { NetworkDiagram, DiagramZone, DiagramNode } from '@/types/index'
import { isZone } from '@/types/index'

export interface NodeRect { x: number; y: number; w: number; h: number }
export interface ZoneRect { x: number; y: number; w: number; h: number; depth: number; name: string; rootName: string }

const NODE_GAP = 32
const ZONE_PAD = 24
const ZONE_HEADER = 28
const ZONE_GAP = 40
const MARGIN = 64
const MAX_PER_COL = 4
const ROW_GAP = 24

interface LayoutResult {
  nodeRects: Map<string, NodeRect>
  zoneRects: ZoneRect[]
  totalW: number
  totalH: number
}

type Dir = 'LR' | 'TD'

function nodeSize(theme: string) {
  return theme === 'simple' ? { w: 140, h: 64 } : { w: 100, h: 90 }
}

function opposite(dir: Dir): Dir { return dir === 'LR' ? 'TD' : 'LR' }

// ============================================================
// Row-based layout for LR mode
// ============================================================

/**
 * Assign each node a global row so that connected nodes share the same row.
 * Returns Map<nodeName, rowIndex>.
 */
function assignRows(diagram: NetworkDiagram): Map<string, number> {
  const rowOf = new Map<string, number>()

  // Build adjacency: for each node, list of connected nodes
  const adj = new Map<string, string[]>()
  for (const n of diagram.nodes) adj.set(n.name, [])
  for (const c of diagram.connections) {
    adj.get(c.from)?.push(c.to)
    adj.get(c.to)?.push(c.from)
  }

  // Build zone column index: which top-level zone is each node in?
  const nodeZoneCol = new Map<string, number>()
  diagram.zones.forEach((z, i) => {
    function walk(zone: DiagramZone) {
      for (const child of zone.children) {
        if (isZone(child)) walk(child)
        else nodeZoneCol.set((child as DiagramNode).name, i)
      }
    }
    walk(z)
  })

  // Track which rows are used per zone-column: zoneCol → Set<row>
  const zoneRowUsage = new Map<number, Set<number>>()
  for (let i = 0; i < diagram.zones.length; i++) zoneRowUsage.set(i, new Set())

  function claimRow(name: string, row: number) {
    rowOf.set(name, row)
    const col = nodeZoneCol.get(name) ?? 0
    zoneRowUsage.get(col)?.add(row)
  }

  function isRowFreeInCol(col: number, row: number): boolean {
    return !(zoneRowUsage.get(col)?.has(row))
  }

  // Process connections left-to-right (by from-node zone column)
  // Sort connections by from-node's zone column
  const sortedConns = [...diagram.connections].sort((a, b) => {
    return (nodeZoneCol.get(a.from) ?? 0) - (nodeZoneCol.get(b.from) ?? 0)
  })

  // BFS-like: process each connection, assign rows
  for (const conn of sortedConns) {
    const fromCol = nodeZoneCol.get(conn.from) ?? 0
    const toCol = nodeZoneCol.get(conn.to) ?? 0

    if (rowOf.has(conn.from) && rowOf.has(conn.to)) continue

    if (!rowOf.has(conn.from) && !rowOf.has(conn.to)) {
      // Neither assigned: find a row free in both columns
      let row = 0
      while (!isRowFreeInCol(fromCol, row) || !isRowFreeInCol(toCol, row)) row++
      claimRow(conn.from, row)
      claimRow(conn.to, row)
    } else if (rowOf.has(conn.from)) {
      // from is assigned, try to put to in same row
      const row = rowOf.get(conn.from)!
      if (isRowFreeInCol(toCol, row)) {
        claimRow(conn.to, row)
      } else {
        // Find nearest free row in toCol
        let r = row
        let offset = 1
        while (true) {
          if (r + offset >= 0 && isRowFreeInCol(toCol, r + offset)) { claimRow(conn.to, r + offset); break }
          if (r - offset >= 0 && isRowFreeInCol(toCol, r - offset)) { claimRow(conn.to, r - offset); break }
          offset++
          if (offset > 20) { claimRow(conn.to, r + offset); break }
        }
      }
    } else {
      // to is assigned, try to put from in same row
      const row = rowOf.get(conn.to)!
      if (isRowFreeInCol(fromCol, row)) {
        claimRow(conn.from, row)
      } else {
        let r = row
        let offset = 1
        while (true) {
          if (r + offset >= 0 && isRowFreeInCol(fromCol, r + offset)) { claimRow(conn.from, r + offset); break }
          if (r - offset >= 0 && isRowFreeInCol(fromCol, r - offset)) { claimRow(conn.from, r - offset); break }
          offset++
          if (offset > 20) { claimRow(conn.from, r + offset); break }
        }
      }
    }
  }

  // Assign remaining unconnected nodes to next available row in their zone column
  for (const node of diagram.nodes) {
    if (rowOf.has(node.name)) continue
    const col = nodeZoneCol.get(node.name) ?? 0
    let row = 0
    while (!isRowFreeInCol(col, row)) row++
    claimRow(node.name, row)
  }

  return rowOf
}

/**
 * LR layout using global row assignment.
 * Each zone is a column; nodes are placed at their assigned row Y.
 */
function layoutLR(diagram: NetworkDiagram, theme: string): LayoutResult {
  const { w: NW, h: NH } = nodeSize(theme)
  const nodeRects = new Map<string, NodeRect>()
  const zoneRects: ZoneRect[] = []

  const rowOf = assignRows(diagram)
  const rowHeight = NH + ROW_GAP

  // Compute zone columns: each top-level zone gets an X position
  // Within a zone, sub-zones and nodes share the same column but may need sub-columns
  let curX = MARGIN

  for (const zone of diagram.zones) {
    const { zoneW } = layoutZoneColumnLR(zone, nodeRects, zoneRects, curX, rowOf, rowHeight, NW, NH, theme, zone.name)
    curX += zoneW + ZONE_GAP
  }

  // Compute total height from max row
  let maxRow = 0
  for (const r of rowOf.values()) if (r > maxRow) maxRow = r
  const totalH = MARGIN + (maxRow + 1) * rowHeight + MARGIN

  return { nodeRects, zoneRects, totalW: curX + MARGIN, totalH }
}

/**
 * Layout a zone as a column in LR mode.
 * Returns the width consumed.
 */
function layoutZoneColumnLR(
  zone: DiagramZone,
  nodeRects: Map<string, NodeRect>,
  zoneRects: ZoneRect[],
  ox: number,
  rowOf: Map<string, number>,
  rowHeight: number,
  NW: number, NH: number,
  theme: string,
  rootName: string
): { w: number; zoneW: number } {
  const innerX = ox + ZONE_PAD

  // Collect all sub-zones and direct nodes
  const subZones: DiagramZone[] = []
  const directNodes: DiagramNode[] = []
  for (const child of zone.children) {
    if (isZone(child)) subZones.push(child)
    else directNodes.push(child)
  }

  let curSubX = innerX
  // Layout sub-zones first (each as a sub-column)
  for (const sz of subZones) {
    const { zoneW } = layoutZoneColumnLR(sz, nodeRects, zoneRects, curSubX, rowOf, rowHeight, NW, NH, theme, rootName)
    curSubX += zoneW + ZONE_GAP
  }

  // Place direct nodes after sub-zones
  const nodeX = subZones.length > 0 ? curSubX : innerX
  for (const node of directNodes) {
    const row = rowOf.get(node.name) ?? 0
    const y = MARGIN + row * rowHeight
    nodeRects.set(node.name, { x: nodeX, y, w: NW, h: NH })
  }

  const contentRight = directNodes.length > 0 ? nodeX + NW + ZONE_PAD : curSubX
  const zoneW = Math.max(contentRight - ox, NW + ZONE_PAD * 2)

  // Compute zone rect: Y spans from min row to max row of contained nodes
  const containedNodes = getAllNodes(zone)
  let minRow = Infinity, maxRow = -1
  for (const n of containedNodes) {
    const r = rowOf.get(n.name) ?? 0
    if (r < minRow) minRow = r
    if (r > maxRow) maxRow = r
  }
  if (minRow === Infinity) { minRow = 0; maxRow = 0 }

  // Count how many sub-zone nesting levels are inside this zone
  const maxChildDepth = getMaxDepth(zone) - zone.depth
  const headerStack = maxChildDepth * (ZONE_HEADER + 6)
  const zoneY = MARGIN + minRow * rowHeight - ZONE_PAD - ZONE_HEADER - headerStack
  const zoneBottom = MARGIN + maxRow * rowHeight + NH + ZONE_PAD
  const zoneH = zoneBottom - zoneY

  zoneRects.push({ x: ox, y: zoneY, w: zoneW, h: zoneH, depth: zone.depth, name: zone.name, rootName })
  return { w: zoneW, zoneW }
}

/** Recursively get all nodes in a zone */
function getAllNodes(zone: DiagramZone): DiagramNode[] {
  const result: DiagramNode[] = []
  for (const child of zone.children) {
    if (isZone(child)) result.push(...getAllNodes(child))
    else result.push(child)
  }
  return result
}

/** Get the maximum depth among this zone and all its descendants */
function getMaxDepth(zone: DiagramZone): number {
  let max = zone.depth
  for (const child of zone.children) {
    if (isZone(child)) {
      const d = getMaxDepth(child)
      if (d > max) max = d
    }
  }
  return max
}

// ============================================================
// Original block-based layout for TD mode
// ============================================================

function layoutNodeBlock(
  nodes: DiagramNode[],
  nodeRects: Map<string, NodeRect>,
  ox: number, oy: number,
  dir: Dir, theme: string
): { w: number; h: number } {
  const { w: NW, h: NH } = nodeSize(theme)
  const n = nodes.length
  const cols = Math.min(3, Math.ceil(n / MAX_PER_COL))
  const perCol = Math.ceil(n / cols)

  if (dir === 'LR') {
    let totalH = 0
    for (let c = 0; c < cols; c++) {
      const start = c * perCol
      const end = Math.min(start + perCol, n)
      for (let i = start; i < end; i++) {
        nodeRects.set(nodes[i].name, {
          x: ox + c * (NW + NODE_GAP),
          y: oy + (i - start) * (NH + NODE_GAP),
          w: NW, h: NH,
        })
      }
      const colH = (end - start) * (NH + NODE_GAP) - NODE_GAP
      if (colH > totalH) totalH = colH
    }
    return { w: cols * (NW + NODE_GAP) - NODE_GAP, h: totalH }
  } else {
    let totalW = 0
    for (let r = 0; r < cols; r++) {
      const start = r * perCol
      const end = Math.min(start + perCol, n)
      for (let i = start; i < end; i++) {
        nodeRects.set(nodes[i].name, {
          x: ox + (i - start) * (NW + NODE_GAP),
          y: oy + r * (NH + NODE_GAP),
          w: NW, h: NH,
        })
      }
      const rowW = (end - start) * (NW + NODE_GAP) - NODE_GAP
      if (rowW > totalW) totalW = rowW
    }
    return { w: totalW, h: cols * (NH + NODE_GAP) - NODE_GAP }
  }
}

function layoutZone(
  zone: DiagramZone,
  nodeRects: Map<string, NodeRect>,
  zoneRects: ZoneRect[],
  ox: number, oy: number,
  dir: Dir, theme: string, rootName: string
): { w: number; h: number } {
  const innerX = ox + ZONE_PAD
  const innerY = oy + ZONE_HEADER + ZONE_PAD

  type Block = { kind: 'zone'; zone: DiagramZone } | { kind: 'nodes'; nodes: DiagramNode[] }
  const blocks: Block[] = []
  for (const child of zone.children) {
    if (isZone(child)) {
      blocks.push({ kind: 'zone', zone: child })
    } else {
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'nodes') last.nodes.push(child)
      else blocks.push({ kind: 'nodes', nodes: [child] })
    }
  }

  let curMain = 0
  let maxCross = 0

  for (const block of blocks) {
    if (curMain > 0) curMain += ZONE_GAP
    if (block.kind === 'zone') {
      const bx = dir === 'LR' ? innerX : innerX + curMain
      const by = dir === 'LR' ? innerY + curMain : innerY
      const { w, h } = layoutZone(block.zone, nodeRects, zoneRects, bx, by, opposite(dir), theme, rootName)
      if (dir === 'LR') { curMain += h; if (w > maxCross) maxCross = w }
      else { curMain += w; if (h > maxCross) maxCross = h }
    } else {
      const bx = dir === 'LR' ? innerX : innerX + curMain
      const by = dir === 'LR' ? innerY + curMain : innerY
      const { w, h } = layoutNodeBlock(block.nodes, nodeRects, bx, by, dir, theme)
      if (dir === 'LR') { curMain += h; if (w > maxCross) maxCross = w }
      else { curMain += w; if (h > maxCross) maxCross = h }
    }
  }

  const { w: NW } = nodeSize(theme)
  const contentMain = Math.max(curMain, NW)
  const contentCross = Math.max(maxCross, NW)

  let totalW: number, totalH: number
  if (dir === 'LR') {
    totalW = contentCross + ZONE_PAD * 2
    totalH = contentMain + ZONE_HEADER + ZONE_PAD * 2
  } else {
    totalW = contentMain + ZONE_PAD * 2
    totalH = contentCross + ZONE_HEADER + ZONE_PAD * 2
  }

  zoneRects.push({ x: ox, y: oy, w: totalW, h: totalH, depth: zone.depth, name: zone.name, rootName })
  return { w: totalW, h: totalH }
}

// ============================================================
// Entry point
// ============================================================

export function useLayout(
  diagram: () => NetworkDiagram,
  display: () => Dir,
  theme: () => string
) {
  return computed<LayoutResult>(() => {
    const d = diagram()
    const t = theme()
    const dir = display()

    if (dir === 'LR') {
      return layoutLR(d, t)
    } else {
      // TD mode: use original block-based layout
      const nodeRects = new Map<string, NodeRect>()
      const zoneRects: ZoneRect[] = []
      let curY = MARGIN
      let maxW = 0
      for (const zone of d.zones) {
        const { w, h } = layoutZone(zone, nodeRects, zoneRects, MARGIN, curY, dir, t, zone.name)
        curY += h + ZONE_GAP
        if (w > maxW) maxW = w
      }
      return { nodeRects, zoneRects, totalW: maxW + MARGIN * 2, totalH: curY + MARGIN }
    }
  })
}
