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

interface LayoutResult {
  nodeRects: Map<string, NodeRect>
  zoneRects: ZoneRect[]
  totalW: number
  totalH: number
}

function nodeSize(theme: string) {
  return theme === 'simple' ? { w: 140, h: 64 } : { w: 100, h: 90 }
}

function layoutZoneLR(
  zone: DiagramZone,
  nodeRects: Map<string, NodeRect>,
  zoneRects: ZoneRect[],
  ox: number, oy: number,
  theme: string,
  rootName: string
): { w: number; h: number } {
  const { w: NW, h: NH } = nodeSize(theme)
  const innerY = oy + ZONE_HEADER + ZONE_PAD
  let curX = ox + ZONE_PAD
  let maxH = 0

  for (const child of zone.children) {
    if (isZone(child)) {
      const { w, h } = layoutZoneLR(child, nodeRects, zoneRects, curX, innerY, theme, rootName)
      curX += w + ZONE_GAP
      if (h > maxH) maxH = h
    }
  }

  const directNodes = zone.children.filter(c => !isZone(c)) as DiagramNode[]
  let nodeColH = 0
  for (const node of directNodes) {
    nodeRects.set(node.name, { x: curX, y: innerY + nodeColH, w: NW, h: NH })
    nodeColH += NH + NODE_GAP
  }
  if (directNodes.length > 0) {
    const colH = nodeColH - NODE_GAP
    if (colH > maxH) maxH = colH
    curX += NW + ZONE_PAD
  }

  const totalW = Math.max(curX - ox, NW + ZONE_PAD * 2)
  const totalH = maxH + ZONE_HEADER + ZONE_PAD * 2

  zoneRects.push({ x: ox, y: oy, w: totalW, h: totalH, depth: zone.depth, name: zone.name, rootName })
  return { w: totalW, h: totalH }
}

function layoutZoneTD(
  zone: DiagramZone,
  nodeRects: Map<string, NodeRect>,
  zoneRects: ZoneRect[],
  ox: number, oy: number,
  theme: string,
  rootName: string
): { w: number; h: number } {
  const { w: NW, h: NH } = nodeSize(theme)
  const innerX = ox + ZONE_PAD
  let curY = oy + ZONE_HEADER + ZONE_PAD
  let maxW = 0

  for (const child of zone.children) {
    if (isZone(child)) {
      const { w, h } = layoutZoneTD(child, nodeRects, zoneRects, innerX, curY, theme, rootName)
      curY += h + ZONE_GAP
      if (w > maxW) maxW = w
    }
  }

  const directNodes = zone.children.filter(c => !isZone(c)) as DiagramNode[]
  let nodeRowW = 0
  for (const node of directNodes) {
    nodeRects.set(node.name, { x: innerX + nodeRowW, y: curY, w: NW, h: NH })
    nodeRowW += NW + NODE_GAP
  }
  if (directNodes.length > 0) {
    const rowW = nodeRowW - NODE_GAP
    if (rowW > maxW) maxW = rowW
    curY += NH + ZONE_PAD
  }

  const totalW = Math.max(maxW + ZONE_PAD * 2, NW + ZONE_PAD * 2)
  const totalH = curY - oy + ZONE_PAD

  zoneRects.push({ x: ox, y: oy, w: totalW, h: totalH, depth: zone.depth, name: zone.name, rootName })
  return { w: totalW, h: totalH }
}

export function useLayout(
  diagram: () => NetworkDiagram,
  display: () => 'LR' | 'TD',
  theme: () => string
) {
  return computed<LayoutResult>(() => {
    const d = diagram()
    const t = theme()
    const nodeRects = new Map<string, NodeRect>()
    const zoneRects: ZoneRect[] = []

    if (display() === 'LR') {
      let curY = MARGIN
      let maxW = 0
      for (const zone of d.zones) {
        const { w, h } = layoutZoneLR(zone, nodeRects, zoneRects, MARGIN, curY, t, zone.name)
        curY += h + ZONE_GAP
        if (w > maxW) maxW = w
      }
      return { nodeRects, zoneRects, totalW: maxW + MARGIN * 2, totalH: curY + MARGIN }
    } else {
      let curX = MARGIN
      let maxH = 0
      for (const zone of d.zones) {
        const { w, h } = layoutZoneTD(zone, nodeRects, zoneRects, curX, MARGIN, t, zone.name)
        curX += w + ZONE_GAP
        if (h > maxH) maxH = h
      }
      return { nodeRects, zoneRects, totalW: curX + MARGIN, totalH: maxH + MARGIN * 2 }
    }
  })
}
