import type { NetworkDiagram, DiagramZone } from '@/types/index'
import { isZone } from '@/types/index'
import type { LayoutGraph, LayoutNode, LayoutEdge, LayoutGroup } from './types'

const NODE_SIZE = { simple: { w: 140, h: 64 }, icon: { w: 100, h: 90 }, image: { w: 100, h: 90 } }

/**
 * Converts a NetworkDiagram (domain model) into a LayoutGraph (layout input).
 * This is the bridge between domain and layout layers.
 */
export function toLayoutGraph(
  diagram: NetworkDiagram,
  options: { theme: 'simple' | 'icon' | 'image'; direction: 'LR' | 'TD' }
): LayoutGraph {
  const { w, h } = NODE_SIZE[options.theme]
  const nodes: LayoutNode[] = []
  const edges: LayoutEdge[] = []
  const groups: LayoutGroup[] = []

  // Walk zones to build groups and assign nodes to parents
  function walkZone(zone: DiagramZone, parentId?: string) {
    groups.push({ id: `zone:${zone.name}`, parentId, label: zone.name, depth: zone.depth })

    for (const child of zone.children) {
      if (isZone(child)) {
        walkZone(child, `zone:${zone.name}`)
      } else {
        nodes.push({ id: child.id, width: w, height: h, parentId: `zone:${zone.name}` })
      }
    }
  }

  for (const zone of diagram.zones) {
    walkZone(zone)
  }

  // Edges — resolve zone-name endpoints to first node in that zone
  const nodeNameToId = new Map(diagram.nodes.map(n => [n.name, n.id]))

  function resolveEndpoint(name: string): string | null {
    if (nodeNameToId.has(name)) return nodeNameToId.get(name)!
    // Zone-level connection: find first node in that zone
    function findFirst(zones: DiagramZone[]): string | null {
      for (const z of zones) {
        if (z.name === name) {
          for (const child of z.children) {
            if (!isZone(child)) return child.id
          }
        }
        const sub = z.children.filter(isZone) as DiagramZone[]
        const found = findFirst(sub)
        if (found) return found
      }
      return null
    }
    return findFirst(diagram.zones)
  }

  diagram.connections.forEach((conn, i) => {
    const sourceId = resolveEndpoint(conn.from)
    const targetId = resolveEndpoint(conn.to)
    if (sourceId && targetId) {
      edges.push({ id: `edge:${i}`, sourceId, targetId })
    }
  })

  return {
    nodes,
    edges,
    groups,
    direction: options.direction === 'TD' ? 'DOWN' : 'RIGHT',
  }
}
