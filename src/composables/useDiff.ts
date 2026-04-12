import type { NetworkDiagram, DiagramNode, DiagramZone, DiagramConnection, DiffState } from '@/types/index'
import { isZone } from '@/types/index'

export interface DiffResult {
  mergedDiagram: NetworkDiagram
  nodeDiffMap: Map<string, DiffState>
}

export function computeDiff(upper: NetworkDiagram, lower: NetworkDiagram): DiffResult {
  const upperNodes = new Map(upper.nodes.map(n => [n.name, n]))
  const lowerNodes = new Map(lower.nodes.map(n => [n.name, n]))

  // Diff nodes
  const nodeDiffMap = new Map<string, DiffState>()
  for (const name of upperNodes.keys()) {
    if (!lowerNodes.has(name)) {
      nodeDiffMap.set(name, 'removed')
    } else {
      const u = upperNodes.get(name)!
      const l = lowerNodes.get(name)!
      if (u.type !== l.type || u.zonePath.join('/') !== l.zonePath.join('/')) {
        nodeDiffMap.set(name, 'modified')
      } else {
        nodeDiffMap.set(name, 'unchanged')
      }
    }
  }
  for (const name of lowerNodes.keys()) {
    if (!upperNodes.has(name)) nodeDiffMap.set(name, 'added')
  }

  // Merge zones (union), nodes use lower version for conflicts
  const mergedZones = mergeZoneTrees(upper.zones, lower.zones)
  const seen = new Set<string>()
  const mergedNodes: DiagramNode[] = []
  for (const n of lower.nodes) { seen.add(n.name); mergedNodes.push(n) }
  for (const n of upper.nodes) { if (!seen.has(n.name)) mergedNodes.push(n) }

  // Merge connections (union by key)
  const connKey = (c: DiagramConnection) => `${c.from}|${c.to}|${c.direction}`
  const connMap = new Map<string, DiagramConnection>()
  for (const c of upper.connections) connMap.set(connKey(c), c)
  for (const c of lower.connections) connMap.set(connKey(c), c)

  const mergedDiagram: NetworkDiagram = {
    meta: lower.meta,
    zones: mergedZones,
    connections: [...connMap.values()],
    nodes: mergedNodes,
  }

  // Place merged nodes into merged zone tree
  rebuildZoneChildren(mergedDiagram.zones, mergedNodes)

  return { mergedDiagram, nodeDiffMap }
}

function mergeZoneTrees(a: DiagramZone[], b: DiagramZone[]): DiagramZone[] {
  const map = new Map<string, DiagramZone>()
  for (const z of a) map.set(z.name, cloneZone(z))
  for (const z of b) {
    if (map.has(z.name)) {
      const existing = map.get(z.name)!
      existing.children = mergeZoneChildren(existing.children, z.children)
    } else {
      map.set(z.name, cloneZone(z))
    }
  }
  return [...map.values()]
}

function mergeZoneChildren(a: (DiagramZone | DiagramNode)[], b: (DiagramZone | DiagramNode)[]): (DiagramZone | DiagramNode)[] {
  const subA = a.filter(isZone) as DiagramZone[]
  const subB = b.filter(isZone) as DiagramZone[]
  const mergedSub = mergeZoneTrees(subA, subB)
  // Nodes will be rebuilt by rebuildZoneChildren
  return [...mergedSub]
}

function cloneZone(z: DiagramZone): DiagramZone {
  return {
    name: z.name,
    depth: z.depth,
    line: z.line,
    children: z.children.map(c => isZone(c) ? cloneZone(c) : { ...c }),
  }
}

function rebuildZoneChildren(zones: DiagramZone[], nodes: DiagramNode[]) {
  // Clear existing node children, keep sub-zones
  function clearNodes(z: DiagramZone) {
    z.children = z.children.filter(isZone)
    for (const c of z.children) clearNodes(c as DiagramZone)
  }
  zones.forEach(clearNodes)

  // Place each node into its zone path
  for (const node of nodes) {
    let current: DiagramZone[] = zones
    for (const zName of node.zonePath) {
      const found = current.find(z => isZone(z) && z.name === zName) as DiagramZone | undefined
      if (found) {
        current = found.children.filter(isZone) as DiagramZone[]
        if (node.zonePath[node.zonePath.length - 1] === zName) {
          found.children.push(node)
        }
      }
    }
  }
}

/** Merge two DSL texts into one, lower takes precedence for conflicts */
export function mergeDiagramText(_upperText: string, _lowerText: string, upper: NetworkDiagram, lower: NetworkDiagram): string {
  const { mergedDiagram } = computeDiff(upper, lower)
  return serializeDiagram(mergedDiagram)
}

function serializeDiagram(d: NetworkDiagram): string {
  const lines: string[] = []
  // Meta
  if (d.meta.title) lines.push(`title: ${d.meta.title}`)
  lines.push(`display: ${d.meta.display}`)
  lines.push(`theme: ${d.meta.theme}`)
  lines.push('---')

  // Zones + nodes
  for (const z of d.zones) serializeZone(z, lines, 0)

  // Connections
  if (d.connections.length) {
    lines.push('')
    for (const c of d.connections) {
      const arrow = c.direction === 'forward' ? '->' : c.direction === 'bidirectional' ? '<->' : '--'
      const proto = c.protocol !== 'Others' ? `: ${c.protocol}${c.description ? ', ' + c.description : ''}` : (c.description ? `: Others, ${c.description}` : '')
      lines.push(`${c.from} ${arrow} ${c.to}${proto}`)
    }
  }

  return lines.join('\n') + '\n'
}

function serializeZone(z: DiagramZone, lines: string[], indent: number) {
  lines.push('  '.repeat(indent) + z.name + ':')
  for (const child of z.children) {
    if (isZone(child)) {
      serializeZone(child, lines, indent + 1)
    } else {
      const n = child as DiagramNode
      let line = `${'  '.repeat(indent + 1)}- ${n.name}, ${n.type}`
      if (n.note) line += `, ${n.note}`
      if (n.tags?.length) line += `, ${n.tags.map(t => '#' + t).join(' ')}`
      lines.push(line)
    }
  }
}
