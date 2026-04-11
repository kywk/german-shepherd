import { computed } from 'vue'
import type { NetworkDiagram, DiagramZone, DiagramNode } from '@/types/index'
import { isZone } from '@/types/index'

export interface NodeRect { x: number; y: number; w: number; h: number }
export interface ZoneRect { x: number; y: number; w: number; h: number; depth: number; name: string; rootName: string }

const NODE_GAP = 16
const ZONE_PAD = 12
const ZONE_HEADER = 28
const ZONE_GAP = 20
const MARGIN = 24
const MAX_PER_COL = 4

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

/**
 * Layout a node block (consecutive direct nodes).
 *
 * dir = parent zone's direction:
 *   LR parent → nodes stack top-to-bottom, overflow into columns left-to-right
 *   TD parent → nodes stack left-to-right, overflow into rows top-to-bottom
 */
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
    // nodes top→bottom, columns left→right
    let totalW = 0
    let totalH = 0
    for (let c = 0; c < cols; c++) {
      const start = c * perCol
      const end = Math.min(start + perCol, n)
      for (let i = start; i < end; i++) {
        const row = i - start
        nodeRects.set(nodes[i].name, {
          x: ox + c * (NW + NODE_GAP),
          y: oy + row * (NH + NODE_GAP),
          w: NW, h: NH,
        })
      }
      const colH = (end - start) * (NH + NODE_GAP) - NODE_GAP
      if (colH > totalH) totalH = colH
    }
    totalW = cols * (NW + NODE_GAP) - NODE_GAP
    return { w: totalW, h: totalH }
  } else {
    // nodes left→right, rows top→bottom
    let totalW = 0
    let totalH = 0
    for (let r = 0; r < cols; r++) {
      const start = r * perCol
      const end = Math.min(start + perCol, n)
      for (let i = start; i < end; i++) {
        const col = i - start
        nodeRects.set(nodes[i].name, {
          x: ox + col * (NW + NODE_GAP),
          y: oy + r * (NH + NODE_GAP),
          w: NW, h: NH,
        })
      }
      const rowW = (end - start) * (NW + NODE_GAP) - NODE_GAP
      if (rowW > totalW) totalW = rowW
    }
    totalH = cols * (NH + NODE_GAP) - NODE_GAP
    return { w: totalW, h: totalH }
  }
}

/**
 * Unified zone layout.
 *
 * dir = this zone's children arrangement direction:
 *   LR → children arranged top-to-bottom (vertical main axis)
 *   TD → children arranged left-to-right (horizontal main axis)
 *
 * Sub-zones use opposite(dir) internally.
 */
function layoutZone(
  zone: DiagramZone,
  nodeRects: Map<string, NodeRect>,
  zoneRects: ZoneRect[],
  ox: number, oy: number,
  dir: Dir, theme: string, rootName: string
): { w: number; h: number } {
  const innerX = ox + ZONE_PAD
  const innerY = oy + ZONE_HEADER + ZONE_PAD

  // Walk children in order, grouping consecutive nodes
  type Block = { kind: 'zone'; zone: DiagramZone } | { kind: 'nodes'; nodes: DiagramNode[] }
  const blocks: Block[] = []
  for (const child of zone.children) {
    if (isZone(child)) {
      blocks.push({ kind: 'zone', zone: child })
    } else {
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'nodes') {
        last.nodes.push(child)
      } else {
        blocks.push({ kind: 'nodes', nodes: [child] })
      }
    }
  }

  // Place blocks along main axis
  let curMain = 0 // offset along main axis from inner origin
  let maxCross = 0 // max extent along cross axis

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
  const minContent = NW // at least one node wide/tall
  const contentMain = Math.max(curMain, minContent)
  const contentCross = Math.max(maxCross, minContent)

  let totalW: number, totalH: number
  if (dir === 'LR') {
    // main axis = vertical, cross = horizontal
    totalW = contentCross + ZONE_PAD * 2
    totalH = contentMain + ZONE_HEADER + ZONE_PAD * 2
  } else {
    // main axis = horizontal, cross = vertical
    totalW = contentMain + ZONE_PAD * 2
    totalH = contentCross + ZONE_HEADER + ZONE_PAD * 2
  }

  zoneRects.push({ x: ox, y: oy, w: totalW, h: totalH, depth: zone.depth, name: zone.name, rootName })
  return { w: totalW, h: totalH }
}

export function useLayout(
  diagram: () => NetworkDiagram,
  display: () => Dir,
  theme: () => string
) {
  return computed<LayoutResult>(() => {
    const d = diagram()
    const t = theme()
    const dir = display()
    const nodeRects = new Map<string, NodeRect>()
    const zoneRects: ZoneRect[] = []

    if (dir === 'LR') {
      // Top-level zones: left → right
      let curX = MARGIN
      let maxH = 0
      for (const zone of d.zones) {
        const { w, h } = layoutZone(zone, nodeRects, zoneRects, curX, MARGIN, dir, t, zone.name)
        curX += w + ZONE_GAP
        if (h > maxH) maxH = h
      }
      return { nodeRects, zoneRects, totalW: curX + MARGIN, totalH: maxH + MARGIN * 2 }
    } else {
      // Top-level zones: top → bottom
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
