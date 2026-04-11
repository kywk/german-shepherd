import { computed } from 'vue'
import type { NetworkDiagram, DiagramZone, DiagramNode } from '@/types/index'
import { isZone } from '@/types/index'

export interface NodeRect { x: number; y: number; w: number; h: number }
export interface ZoneRect { x: number; y: number; w: number; h: number; depth: number; name: string }

// Node dimensions
const NODE_W = 140
const NODE_H = 64
const NODE_GAP = 16       // gap between nodes
const ZONE_PAD = 12       // padding inside zone
const ZONE_HEADER = 28    // zone title bar height
const ZONE_GAP = 20       // gap between sibling zones

interface LayoutResult {
  nodeRects: Map<string, NodeRect>
  zoneRects: ZoneRect[]
  totalW: number
  totalH: number
}

// Recursively compute zone size and positions in LR mode
// In LR: zones stack vertically, sub-zones stack horizontally inside parent
function layoutZoneLR(
  zone: DiagramZone,
  nodeRects: Map<string, NodeRect>,
  zoneRects: ZoneRect[],
  ox: number, oy: number
): { w: number; h: number } {
  const innerY = oy + ZONE_HEADER + ZONE_PAD
  let curX = ox + ZONE_PAD
  let maxH = 0

  for (const child of zone.children) {
    if (isZone(child)) {
      const { w, h } = layoutZoneLR(child, nodeRects, zoneRects, curX, innerY)
      curX += w + ZONE_GAP
      if (h > maxH) maxH = h
    } else {
      // node: stack vertically in current column
      // We'll handle nodes after sub-zones; collect them first
    }
  }

  // Nodes in this zone (direct children only) — place them as a vertical column after sub-zones
  const directNodes = zone.children.filter(c => !isZone(c)) as DiagramNode[]
  let nodeColH = 0
  for (const node of directNodes) {
    nodeRects.set(node.name, { x: curX, y: innerY + nodeColH, w: NODE_W, h: NODE_H })
    nodeColH += NODE_H + NODE_GAP
  }
  if (directNodes.length > 0) {
    const colH = nodeColH - NODE_GAP
    if (colH > maxH) maxH = colH
    curX += NODE_W + ZONE_PAD
  }

  const totalW = curX - ox
  const totalH = maxH + ZONE_HEADER + ZONE_PAD * 2

  zoneRects.push({ x: ox, y: oy, w: totalW, h: totalH, depth: zone.depth, name: zone.name })
  return { w: totalW, h: totalH }
}

// In TD: top-level zones stack vertically; inside each zone nodes are horizontal
function layoutZoneTD(
  zone: DiagramZone,
  nodeRects: Map<string, NodeRect>,
  zoneRects: ZoneRect[],
  ox: number, oy: number
): { w: number; h: number } {
  const innerX = ox + ZONE_PAD
  let curY = oy + ZONE_HEADER + ZONE_PAD
  let maxW = 0

  for (const child of zone.children) {
    if (isZone(child)) {
      const { w, h } = layoutZoneTD(child, nodeRects, zoneRects, innerX, curY)
      curY += h + ZONE_GAP
      if (w > maxW) maxW = w
    }
  }

  const directNodes = zone.children.filter(c => !isZone(c)) as DiagramNode[]
  let nodeRowW = 0
  for (const node of directNodes) {
    nodeRects.set(node.name, { x: innerX + nodeRowW, y: curY, w: NODE_W, h: NODE_H })
    nodeRowW += NODE_W + NODE_GAP
  }
  if (directNodes.length > 0) {
    const rowW = nodeRowW - NODE_GAP
    if (rowW > maxW) maxW = rowW
    curY += NODE_H + ZONE_PAD
  }

  const totalW = maxW + ZONE_PAD * 2
  const totalH = curY - oy + ZONE_PAD

  zoneRects.push({ x: ox, y: oy, w: totalW, h: totalH, depth: zone.depth, name: zone.name })
  return { w: totalW, h: totalH }
}

export function useLayout(diagram: () => NetworkDiagram, display: () => 'LR' | 'TD') {
  return computed<LayoutResult>(() => {
    const d = diagram()
    const nodeRects = new Map<string, NodeRect>()
    const zoneRects: ZoneRect[] = []
    const MARGIN = 24

    if (display() === 'LR') {
      let curY = MARGIN
      let maxW = 0
      for (const zone of d.zones) {
        const { w, h } = layoutZoneLR(zone, nodeRects, zoneRects, MARGIN, curY)
        curY += h + ZONE_GAP
        if (w > maxW) maxW = w
      }
      return { nodeRects, zoneRects, totalW: maxW + MARGIN * 2, totalH: curY + MARGIN }
    } else {
      let curX = MARGIN
      let maxH = 0
      for (const zone of d.zones) {
        const { w, h } = layoutZoneTD(zone, nodeRects, zoneRects, curX, MARGIN)
        curX += w + ZONE_GAP
        if (h > maxH) maxH = h
      }
      return { nodeRects, zoneRects, totalW: curX + MARGIN, totalH: maxH + MARGIN * 2 }
    }
  })
}
