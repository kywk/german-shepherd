import ELK from 'elkjs/lib/elk.bundled.js'
import type { LayoutGraph, LayoutResult, PositionedNode, PositionedEdge, PositionedGroup } from './types'

const elk = new ELK()

const PADDING = 20
const HEADER_HEIGHT = 30

/**
 * Runs ELK layout on a LayoutGraph and returns positioned results.
 * This is the only file that knows about ELK internals.
 */
export async function runElkLayout(graph: LayoutGraph): Promise<LayoutResult> {
  const elkGraph = toElkGraph(graph)
  const result = await elk.layout(elkGraph)
  return fromElkResult(result, graph)
}

function toElkGraph(graph: LayoutGraph) {
  const direction = graph.direction === 'DOWN' ? 'DOWN' : 'RIGHT'

  // Build group hierarchy: parentId → children groups
  const groupMap = new Map(graph.groups.map(g => [g.id, g]))
  const topGroups = graph.groups.filter(g => !g.parentId)
  const childGroupsOf = (parentId: string) => graph.groups.filter(g => g.parentId === parentId)

  // Build ELK children recursively
  function buildGroup(groupId: string): any {
    const group = groupMap.get(groupId)!
    const childGroups = childGroupsOf(groupId)
    const childNodes = graph.nodes.filter(n => n.parentId === groupId)

    return {
      id: groupId,
      labels: [{ text: group.label }],
      layoutOptions: {
        'elk.padding': `[top=${PADDING + HEADER_HEIGHT},left=${PADDING},bottom=${PADDING},right=${PADDING}]`,
      },
      children: [
        ...childGroups.map(cg => buildGroup(cg.id)),
        ...childNodes.map(n => ({
          id: n.id,
          width: n.width,
          height: n.height,
        })),
      ],
      edges: [] as any[],
    }
  }

  // Top-level nodes (no parent group)
  const topNodes = graph.nodes.filter(n => !n.parentId)

  // Build top-level ELK graph
  const elkChildren = [
    ...topGroups.map(g => buildGroup(g.id)),
    ...topNodes.map(n => ({ id: n.id, width: n.width, height: n.height })),
  ]

  // ELK edges must be placed at the lowest common ancestor.
  // For simplicity, place all edges at root level using hierarchical layout.
  const elkEdges = graph.edges.map(e => ({
    id: e.id,
    sources: [e.sourceId],
    targets: [e.targetId],
  }))

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.spacing.nodeNode': '30',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: elkChildren,
    edges: elkEdges,
  }
}

function fromElkResult(elkResult: any, graph: LayoutGraph): LayoutResult {
  const nodes: PositionedNode[] = []
  const groups: PositionedGroup[] = []
  const groupMap = new Map(graph.groups.map(g => [g.id, g]))
  const nodeSet = new Set(graph.nodes.map(n => n.id))

  // Recursively extract positioned nodes and groups
  function extract(elkNode: any, offsetX: number, offsetY: number) {
    const x = (elkNode.x ?? 0) + offsetX
    const y = (elkNode.y ?? 0) + offsetY

    if (nodeSet.has(elkNode.id)) {
      nodes.push({
        id: elkNode.id,
        x,
        y,
        width: elkNode.width ?? 0,
        height: elkNode.height ?? 0,
      })
    } else if (groupMap.has(elkNode.id)) {
      const g = groupMap.get(elkNode.id)!
      groups.push({
        id: elkNode.id,
        x,
        y,
        width: elkNode.width ?? 0,
        height: elkNode.height ?? 0,
        label: g.label,
        depth: g.depth,
        parentId: g.parentId,
      })
    }

    if (elkNode.children) {
      for (const child of elkNode.children) {
        extract(child, x, y)
      }
    }
  }

  if (elkResult.children) {
    for (const child of elkResult.children) {
      extract(child, 0, 0)
    }
  }

  // Extract edges with bend points
  const edges: PositionedEdge[] = (elkResult.edges ?? []).map((e: any) => {
    const points: { x: number; y: number }[] = []
    if (e.sections) {
      for (const section of e.sections) {
        if (section.startPoint) points.push(section.startPoint)
        if (section.bendPoints) points.push(...section.bendPoints)
        if (section.endPoint) points.push(section.endPoint)
      }
    }
    return {
      id: e.id,
      sourceId: e.sources?.[0] ?? '',
      targetId: e.targets?.[0] ?? '',
      points: points.length > 0 ? points : undefined,
    }
  })

  return {
    nodes,
    edges,
    groups,
    width: elkResult.width ?? 0,
    height: elkResult.height ?? 0,
  }
}
