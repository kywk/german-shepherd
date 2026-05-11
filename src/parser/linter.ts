import type { NetworkDiagram, LintDiagnostic, DiagramZone, DiagramNode } from '@/types/index'
import { NODE_TYPES, CONNECTION_PROTOCOLS } from '@/types/index'

export function lint(diagram: NetworkDiagram): LintDiagnostic[] {
  const diags: LintDiagnostic[] = []
  const { nodes, connections } = diagram

  // duplicate-node
  const seen = new Map<string, number>()
  for (const node of nodes) {
    if (seen.has(node.name)) {
      diags.push({ line: node.line, column: 1, message: `重複節點: "${node.name}"`, severity: 'error', rule: 'duplicate-node' })
    } else {
      seen.set(node.name, node.line)
    }
  }

  // invalid-node-type
  for (const node of nodes) {
    if (!NODE_TYPES.includes(node.type as any)) {
      diags.push({ line: node.line, column: 1, message: `無效節點類型: "${node.type}"`, severity: 'error', rule: 'invalid-node-type' })
    }
  }

  // max-depth-exceeded
  function checkDepth(zones: NetworkDiagram['zones']) {
    for (const zone of zones) {
      if (zone.depth >= 3) {
        diags.push({ line: zone.line, column: 1, message: `區段巢狀超過 3 層: "${zone.name}"`, severity: 'error', rule: 'max-depth-exceeded' })
      }
      const subZones = zone.children.filter(c => 'children' in c) as NetworkDiagram['zones']
      checkDepth(subZones)
    }
  }
  checkDepth(diagram.zones)

  const nodeNames = new Set(nodes.map(n => n.name))
  const { zoneNames } = diagram

  // undefined-node-ref: allow zone names as group-level connection endpoints
  for (const conn of connections) {
    if (!nodeNames.has(conn.from) && !zoneNames.has(conn.from)) {
      diags.push({ line: conn.line, column: 1, message: `連線引用不存在的節點或區段: "${conn.from}"`, severity: 'error', rule: 'undefined-node-ref' })
    }
    if (!nodeNames.has(conn.to) && !zoneNames.has(conn.to)) {
      diags.push({ line: conn.line, column: 1, message: `連線引用不存在的節點或區段: "${conn.to}"`, severity: 'error', rule: 'undefined-node-ref' })
    }
  }

  // invalid-protocol
  for (const conn of connections) {
    if (!CONNECTION_PROTOCOLS.includes(conn.protocol as any)) {
      diags.push({ line: conn.line, column: 1, message: `無效通訊協定: "${conn.protocol}"`, severity: 'error', rule: 'invalid-protocol' })
    }
  }

  // isolated-node: also mark as connected all nodes inside a zone referenced in connections
  const connected = new Set<string>()
  // Collect all nodes inside a given zone name
  function nodesInZone(zoneName: string): string[] {
    function findZone(zoneList: NetworkDiagram['zones']): DiagramZone | null {
      for (const z of zoneList) {
        if (z.name === zoneName) return z
        const sub = z.children.filter(c => 'children' in c) as NetworkDiagram['zones']
        const found = findZone(sub)
        if (found) return found
      }
      return null
    }
    const zone = findZone(diagram.zones)
    if (!zone) return []
    return getAllNodes(zone).map(n => n.name)
  }
  function getAllNodes(zone: DiagramZone): DiagramNode[] {
    const result: DiagramNode[] = []
    for (const child of zone.children) {
      if ('children' in child) result.push(...getAllNodes(child as DiagramZone))
      else result.push(child as DiagramNode)
    }
    return result
  }
  for (const conn of connections) {
    // If endpoint is a zone name, mark all its nodes as connected
    if (zoneNames.has(conn.from)) {
      nodesInZone(conn.from).forEach(n => connected.add(n))
    } else {
      connected.add(conn.from)
    }
    if (zoneNames.has(conn.to)) {
      nodesInZone(conn.to).forEach(n => connected.add(n))
    } else {
      connected.add(conn.to)
    }
  }
  for (const node of nodes) {
    if (!connected.has(node.name)) {
      diags.push({ line: node.line, column: 1, message: `孤立節點: "${node.name}" 未出現在任何連線中`, severity: 'warning', rule: 'isolated-node' })
    }
  }

  return diags
}
