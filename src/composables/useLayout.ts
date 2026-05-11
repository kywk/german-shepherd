import { computed } from 'vue'
import type { NetworkDiagram, DiagramZone, DiagramNode, DiagramConnection } from '@/types/index'
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

/**
 * Assign each node a global row so that connected nodes share the same row.
 * Returns Map<nodeName, rowIndex>.
 */
function assignRows(diagram: NetworkDiagram): Map<string, number> {
  const rowOf = new Map<string, number>()

  // Map both node names AND zone names to their top-level zone column index
  const nodeZoneCol = new Map<string, number>()
  diagram.zones.forEach((z, i) => {
    function walk(zone: DiagramZone) {
      nodeZoneCol.set(zone.name, i) // zone name → column
      for (const child of zone.children) {
        if (isZone(child)) walk(child)
        else nodeZoneCol.set((child as DiagramNode).name, i)
      }
    }
    walk(z)
  })

  // For group connections (zone name as endpoint), resolve to first node in that zone
  const nodeNameSet = new Set(diagram.nodes.map(n => n.name))
  function resolveEndpoint(name: string): string {
    if (nodeNameSet.has(name)) return name
    // Find first node in the named zone
    function findFirst(zones: DiagramZone[]): string | null {
      for (const z of zones) {
        if (z.name === name) {
          const nodes = getAllNodes(z)
          return nodes[0]?.name ?? null
        }
        const sub = z.children.filter(isZone) as DiagramZone[]
        const found = findFirst(sub)
        if (found) return found
      }
      return null
    }
    return findFirst(diagram.zones) ?? name
  }

  // Expand group connections to node-level for row assignment
  const effectiveConns = diagram.connections.map(c => ({
    ...c,
    from: resolveEndpoint(c.from),
    to: resolveEndpoint(c.to),
  }))

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

  // Sort by zone-span distance ascending (adjacent connections first),
  // then by leftmost column — prevents long-range connections from pre-empting rows
  const sortedConns = [...effectiveConns].sort((a, b) => {
    const distA = Math.abs((nodeZoneCol.get(a.to) ?? 0) - (nodeZoneCol.get(a.from) ?? 0))
    const distB = Math.abs((nodeZoneCol.get(b.to) ?? 0) - (nodeZoneCol.get(b.from) ?? 0))
    if (distA !== distB) return distA - distB
    return Math.min(nodeZoneCol.get(a.from) ?? 0, nodeZoneCol.get(a.to) ?? 0)
         - Math.min(nodeZoneCol.get(b.from) ?? 0, nodeZoneCol.get(b.to) ?? 0)
  })

  for (const conn of sortedConns) {
    const fromCol = nodeZoneCol.get(conn.from) ?? 0
    const toCol = nodeZoneCol.get(conn.to) ?? 0

    if (rowOf.has(conn.from) && rowOf.has(conn.to)) continue

    if (!rowOf.has(conn.from) && !rowOf.has(conn.to)) {
      if (fromCol === toCol) {
        let row = 0
        while (!isRowFreeInCol(fromCol, row)) row++
        claimRow(conn.from, row)
        row++
        while (!isRowFreeInCol(toCol, row)) row++
        claimRow(conn.to, row)
      } else {
        let row = 0
        while (!isRowFreeInCol(fromCol, row) || !isRowFreeInCol(toCol, row)) row++
        claimRow(conn.from, row)
        claimRow(conn.to, row)
      }
    } else if (rowOf.has(conn.from)) {
      const row = rowOf.get(conn.from)!
      if (isRowFreeInCol(toCol, row)) {
        claimRow(conn.to, row)
      } else {
        let r = row, offset = 1
        while (true) {
          if (r + offset >= 0 && isRowFreeInCol(toCol, r + offset)) { claimRow(conn.to, r + offset); break }
          if (r - offset >= 0 && isRowFreeInCol(toCol, r - offset)) { claimRow(conn.to, r - offset); break }
          offset++
          if (offset > 20) { claimRow(conn.to, r + offset); break }
        }
      }
    } else {
      const row = rowOf.get(conn.to)!
      if (isRowFreeInCol(fromCol, row)) {
        claimRow(conn.from, row)
      } else {
        let r = row, offset = 1
        while (true) {
          if (r + offset >= 0 && isRowFreeInCol(fromCol, r + offset)) { claimRow(conn.from, r + offset); break }
          if (r - offset >= 0 && isRowFreeInCol(fromCol, r - offset)) { claimRow(conn.from, r - offset); break }
          offset++
          if (offset > 20) { claimRow(conn.from, r + offset); break }
        }
      }
    }
  }

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
 * After assignRows, compact nodes within each sub-zone so they occupy consecutive rows.
 * Other nodes in the same zone column are shifted down to avoid conflicts.
 */
function compactSubZones(diagram: NetworkDiagram, rowOf: Map<string, number>): void {
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

  function processSubZone(sz: DiagramZone, zoneIdx: number) {
    // Recurse into nested sub-zones first
    for (const child of sz.children) {
      if (isZone(child)) processSubZone(child, zoneIdx)
    }

    const subNodes = getAllNodes(sz)
    if (subNodes.length <= 1) return

    const currentRows = subNodes.map(n => rowOf.get(n.name) ?? 0).sort((a, b) => a - b)
    const isConsecutive = currentRows.every((r, i) => i === 0 || r === currentRows[i - 1] + 1)
    if (isConsecutive) return

    // All nodes in this zone column that are NOT in this sub-zone
    const subNodeSet = new Set(subNodes.map(n => n.name))
    const otherNodes = diagram.nodes.filter(n =>
      nodeZoneCol.get(n.name) === zoneIdx && !subNodeSet.has(n.name)
    )
    const otherRowsSet = new Set(otherNodes.map(n => rowOf.get(n.name) ?? 0))

    // Sort sub-zone nodes by their current row to preserve relative order
    const sortedSub = subNodes.slice().sort((a, b) => (rowOf.get(a.name) ?? 0) - (rowOf.get(b.name) ?? 0))
    const needed = sortedSub.length

    // Search bidirectionally from anchor (min current row) to find closest conflict-free position
    const anchor = currentRows[0]
    let bestStart = anchor
    let found = false
    for (let offset = 0; offset <= 100 && !found; offset++) {
      // Try moving up first (toward smaller row numbers)
      for (const candidate of offset === 0 ? [anchor] : [anchor - offset, anchor + offset]) {
        if (candidate < 0) continue
        let conflict = false
        for (let k = 0; k < needed; k++) {
          if (otherRowsSet.has(candidate + k)) { conflict = true; break }
        }
        if (!conflict) { bestStart = candidate; found = true; break }
      }
    }

    // Assign consecutive rows
    sortedSub.forEach((n, i) => rowOf.set(n.name, bestStart + i))
  }

  for (let zoneIdx = 0; zoneIdx < diagram.zones.length; zoneIdx++) {
    for (const child of diagram.zones[zoneIdx].children) {
      if (isZone(child)) processSubZone(child, zoneIdx)
    }
  }
}

/**
 * Detect sub-zone node layout: returns column count and node order.
 * - Chain (sequential internal connections) → 1 col, topological order
 * - Independent nodes → 2 cols, original order
 */
function detectSubZoneLayout(
  nodes: DiagramNode[],
  allConnections: DiagramConnection[]
): { cols: number; orderedNodes: DiagramNode[] } {
  if (nodes.length <= 2) return { cols: 1, orderedNodes: nodes }

  const nodeSet = new Set(nodes.map(n => n.name))
  const internalConns = allConnections.filter(c => nodeSet.has(c.from) && nodeSet.has(c.to))

  if (internalConns.length === 0) {
    // No internal connections → 2-col grid
    return { cols: 2, orderedNodes: nodes }
  }

  // Build adjacency for topological sort
  const inDegree = new Map<string, number>()
  const outAdj = new Map<string, string[]>()
  for (const n of nodes) { inDegree.set(n.name, 0); outAdj.set(n.name, []) }
  for (const c of internalConns) {
    outAdj.get(c.from)?.push(c.to)
    inDegree.set(c.to, (inDegree.get(c.to) ?? 0) + 1)
  }

  // Topological sort
  const queue = nodes.filter(n => (inDegree.get(n.name) ?? 0) === 0)
  const ordered: DiagramNode[] = []
  const visited = new Set<string>()
  while (queue.length > 0) {
    const n = queue.shift()!
    if (visited.has(n.name)) continue
    visited.add(n.name)
    ordered.push(n)
    for (const nextName of (outAdj.get(n.name) ?? [])) {
      inDegree.set(nextName, (inDegree.get(nextName) ?? 1) - 1)
      if ((inDegree.get(nextName) ?? 0) <= 0) {
        const nextNode = nodes.find(x => x.name === nextName)
        if (nextNode && !visited.has(nextName)) queue.push(nextNode)
      }
    }
  }
  for (const n of nodes) if (!visited.has(n.name)) ordered.push(n)

  // If chain-like (most nodes have at most 1 internal successor) → 1 col
  const maxOutDegree = Math.max(...nodes.map(n => (outAdj.get(n.name) ?? []).length))
  if (maxOutDegree <= 1) {
    return { cols: 1, orderedNodes: ordered }
  }

  // Fan-out or complex → 2 cols
  return { cols: 2, orderedNodes: ordered }
}

/**
 * LR layout using global row assignment + sub-zone compaction.
 */
function layoutLR(diagram: NetworkDiagram, theme: string): LayoutResult {
  const { w: NW, h: NH } = nodeSize(theme)
  const nodeRects = new Map<string, NodeRect>()
  const zoneRects: ZoneRect[] = []

  const rowOf = assignRows(diagram)
  compactSubZones(diagram, rowOf)

  const rowHeight = NH + ROW_GAP

  let curX = MARGIN
  for (const zone of diagram.zones) {
    const { zoneW } = layoutZoneColumnLR(zone, nodeRects, zoneRects, curX, rowOf, rowHeight, NW, NH, theme, zone.name, diagram.connections)
    curX += zoneW + ZONE_GAP
  }

  let maxRow = 0
  for (const r of rowOf.values()) if (r > maxRow) maxRow = r
  const totalH = MARGIN + (maxRow + 1) * rowHeight + MARGIN

  // Expand top-level zone rects to full diagram height (dashed separator)
  const topY = MARGIN / 2
  for (const zr of zoneRects) {
    if (zr.depth === 0) {
      zr.y = topY
      zr.h = totalH - topY
    }
  }

  return { nodeRects, zoneRects, totalW: curX + MARGIN, totalH }
}

/**
 * Layout a zone as a column in LR mode.
 * Sub-zones support 1-col (chain) or 2-col (independent) layout based on connection pattern.
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
  rootName: string,
  allConnections: DiagramConnection[]
): { w: number; zoneW: number } {
  const innerX = ox + ZONE_PAD

  const subZones: DiagramZone[] = []
  const directNodes: DiagramNode[] = []
  for (const child of zone.children) {
    if (isZone(child)) subZones.push(child)
    else directNodes.push(child)
  }

  let curSubX = innerX
  let maxSubRight = innerX

  // Layout sub-zones
  for (const sz of subZones) {
    const szNodes = getAllNodes(sz)
    const { cols, orderedNodes } = detectSubZoneLayout(szNodes, allConnections)

    if (cols === 1) {
      // Single-column: use existing recursive layout (preserves row alignment)
      const { zoneW } = layoutZoneColumnLR(sz, nodeRects, zoneRects, curSubX, rowOf, rowHeight, NW, NH, theme, rootName, allConnections)
      curSubX += zoneW + ZONE_GAP
      if (curSubX - ZONE_GAP > maxSubRight) maxSubRight = curSubX - ZONE_GAP
    } else {
      // Multi-column: place nodes in a 2-col grid, anchored at anchor row
      // Anchor row = min row of all sub-zone nodes (after compaction, they're consecutive)
      const szRows = orderedNodes.map(n => rowOf.get(n.name) ?? 0).sort((a, b) => a - b)
      const anchorRow = szRows[0]

      orderedNodes.forEach((node, idx) => {
        const gridCol = idx % cols
        const gridRow = Math.floor(idx / cols)
        const nx = curSubX + gridCol * (NW + NODE_GAP)
        const ny = MARGIN + (anchorRow + gridRow) * rowHeight
        nodeRects.set(node.name, { x: nx, y: ny, w: NW, h: NH })
      })

      const rowSpan = Math.ceil(orderedNodes.length / cols)
      const szW = cols * NW + (cols - 1) * NODE_GAP
      const szH = rowSpan * NH + (rowSpan - 1) * ROW_GAP

      const maxChildDepth = getMaxDepth(sz) - sz.depth
      const headerStack = maxChildDepth * (ZONE_HEADER + 6)
      const szY = MARGIN + anchorRow * rowHeight - ZONE_PAD - ZONE_HEADER - headerStack
      const szBottom = MARGIN + anchorRow * rowHeight + szH + ZONE_PAD
      const szTotalW = szW + ZONE_PAD * 2
      const szTotalH = szBottom - szY

      zoneRects.push({ x: curSubX - ZONE_PAD, y: szY, w: szTotalW, h: szTotalH, depth: sz.depth, name: sz.name, rootName })

      const szRight = curSubX + szW
      if (szRight > maxSubRight) maxSubRight = szRight
      curSubX += szTotalW + ZONE_GAP
    }
  }

  // Place direct nodes (after sub-zones, in a single column or inline)
  const nodeX = maxSubRight > innerX ? maxSubRight + ZONE_GAP : innerX

  // If direct nodes >= 3 and no sub-zones, try 2-col arrangement
  let directCols = 1
  if (subZones.length === 0 && directNodes.length >= 5) {
    const { cols } = detectSubZoneLayout(directNodes, allConnections)
    directCols = cols
  }

  if (directCols === 2) {
    // Sort direct nodes by row for stable ordering
    const sortedDirect = directNodes.slice().sort((a, b) => (rowOf.get(a.name) ?? 0) - (rowOf.get(b.name) ?? 0))
    const baseRow = rowOf.get(sortedDirect[0].name) ?? 0
    sortedDirect.forEach((node, idx) => {
      const gridCol = idx % 2
      const gridRow = Math.floor(idx / 2)
      const nx = nodeX + gridCol * (NW + NODE_GAP)
      const ny = MARGIN + (baseRow + gridRow) * rowHeight
      nodeRects.set(node.name, { x: nx, y: ny, w: NW, h: NH })
    })
  } else {
    for (const node of directNodes) {
      const row = rowOf.get(node.name) ?? 0
      const y = MARGIN + row * rowHeight
      nodeRects.set(node.name, { x: nodeX, y, w: NW, h: NH })
    }
  }

  const usedRight = directNodes.length > 0
    ? nodeX + (directCols === 2 ? NW * 2 + NODE_GAP : NW) + ZONE_PAD
    : curSubX

  const zoneW = Math.max(usedRight - ox, NW + ZONE_PAD * 2)

  // Compute zone rect
  const containedNodes = getAllNodes(zone)
  let minRow = Infinity, maxRow = -1
  for (const n of containedNodes) {
    const r = rowOf.get(n.name) ?? 0
    if (r < minRow) minRow = r
    if (r > maxRow) maxRow = r
  }
  if (minRow === Infinity) { minRow = 0; maxRow = 0 }

  const maxChildDepth = getMaxDepth(zone) - zone.depth
  const headerStack = maxChildDepth * (ZONE_HEADER + 6)
  const zoneY = MARGIN + minRow * rowHeight - ZONE_PAD - ZONE_HEADER - headerStack
  const zoneBottom = MARGIN + maxRow * rowHeight + NH + ZONE_PAD
  const zoneH = zoneBottom - zoneY

  zoneRects.push({ x: ox, y: zoneY, w: zoneW, h: zoneH, depth: zone.depth, name: zone.name, rootName })
  return { w: zoneW, zoneW }
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
