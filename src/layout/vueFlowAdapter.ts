import type { Node, Edge } from '@vue-flow/core'
import { MarkerType } from '@vue-flow/core'
import type { LayoutResult } from './types'
import type { NetworkDiagram } from '@/types/index'

const ZONE_COLORS = [
  'var(--zone-color-1)', 'var(--zone-color-2)', 'var(--zone-color-3)',
  'var(--zone-color-4)', 'var(--zone-color-5)', 'var(--zone-color-6)',
]

export interface VueFlowGraphOptions {
  theme: 'simple' | 'icon' | 'image'
  showTags: boolean
  lintWarnNodes?: Set<string>
  isManualMode?: boolean
}

/**
 * Converts a LayoutResult + domain data into Vue Flow nodes and edges.
 * This is the only file that knows about Vue Flow's data format.
 */
export function toVueFlowGraph(
  layoutResult: LayoutResult,
  diagram: NetworkDiagram,
  options: VueFlowGraphOptions
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []

  // Zone color assignment by top-level zone order
  const rootZoneColorMap = new Map<string, string>()
  diagram.zones.forEach((z, i) => rootZoneColorMap.set(z.name, ZONE_COLORS[i % ZONE_COLORS.length]))

  // Zone background nodes
  for (const group of layoutResult.groups) {
    const rootName = findRootZoneName(group.id, layoutResult.groups)
    nodes.push({
      id: group.id,
      type: 'gsZone',
      position: { x: group.x, y: group.y },
      data: {
        name: group.label,
        depth: group.depth,
        color: rootZoneColorMap.get(rootName) ?? ZONE_COLORS[0],
        w: group.width,
        h: group.height,
      },
      draggable: false,
      selectable: false,
      connectable: false,
      zIndex: -1,
    })
  }

  // Regular nodes
  const nodeMap = new Map(diagram.nodes.map(n => [n.id, n]))
  for (const pos of layoutResult.nodes) {
    const domainNode = nodeMap.get(pos.id)
    if (!domainNode) continue

    nodes.push({
      id: domainNode.name,
      type: 'gsNode',
      position: { x: pos.x, y: pos.y },
      data: {
        name: domainNode.name,
        type: domainNode.type,
        note: domainNode.note,
        tags: domainNode.tags,
        theme: options.theme,
        showTags: options.showTags,
        isLintWarning: options.lintWarnNodes?.has(domainNode.name) ?? false,
      },
      draggable: options.isManualMode ?? false,
    })
  }

  // Edges
  const edges: Edge[] = diagram.connections.map((conn, i) => {
    const layoutEdge = layoutResult.edges.find(e => e.id === `edge:${i}`)
    return {
      id: `${conn.from}-${conn.to}-${i}`,
      source: resolveNodeName(conn.from, diagram),
      target: resolveNodeName(conn.to, diagram),
      type: 'gsEdge',
      markerEnd: conn.direction !== 'none' ? MarkerType.ArrowClosed : undefined,
      markerStart: conn.direction === 'bidirectional' ? MarkerType.ArrowClosed : undefined,
      data: {
        protocol: conn.protocol,
        description: conn.description,
        direction: conn.direction,
        points: layoutEdge?.points,
      },
    }
  })

  return { nodes, edges }
}

/** Find the root zone name for a group by walking up parentId chain */
function findRootZoneName(groupId: string, groups: LayoutResult['groups']): string {
  const groupMap = new Map(groups.map(g => [g.id, g]))
  let current = groupMap.get(groupId)
  while (current?.parentId) {
    current = groupMap.get(current.parentId)
  }
  return current?.label ?? groupId.replace('zone:', '')
}

/** Resolve connection endpoint name to a node name (handles zone-level connections) */
function resolveNodeName(name: string, diagram: NetworkDiagram): string {
  if (diagram.nodes.some(n => n.name === name)) return name
  // Zone-level: find first node
  function findFirst(zones: typeof diagram.zones): string | null {
    for (const z of zones) {
      if (z.name === name) {
        for (const child of z.children) {
          if (!('children' in child)) return (child as { name: string }).name
        }
      }
      const subs = z.children.filter(c => 'children' in c) as typeof zones
      const found = findFirst(subs)
      if (found) return found
    }
    return null
  }
  return findFirst(diagram.zones) ?? name
}
