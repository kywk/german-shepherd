import type { DiagramZone, DiagramNode, DiagramConnection, ConnectionDirection, ConnectionProtocol } from '@/types/index'
import { NODE_TYPES, CONNECTION_PROTOCOLS } from '@/types/index'

type ParseResult = { zones: DiagramZone[], connections: DiagramConnection[], nodes: DiagramNode[] }

function parseNode(line: string, lineNum: number, zonePath: string[]): DiagramNode {
  // strip leading "- "
  const raw = line.replace(/^-\s*/, '')
  const parts = raw.split(',').map(s => s.trim())
  const name = parts[0]
  const type = parts[1] as DiagramNode['type']
  let note: string | undefined
  const tags: string[] = []
  for (let i = 2; i < parts.length; i++) {
    const p = parts[i]
    if (p.includes('#')) {
      tags.push(...p.split(/\s+/).filter(t => t.startsWith('#')).map(t => t.slice(1)))
    } else if (p) {
      note = p
    }
  }
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    type: NODE_TYPES.includes(type as any) ? type : type,
    ...(note ? { note } : {}),
    ...(tags.length ? { tags } : {}),
    zonePath,
    line: lineNum,
  }
}

function parseConnection(line: string, lineNum: number): DiagramConnection | null {
  const m = line.match(/^(.+?)\s*(->|<->|--)\s*(.+?):\s*(.+)$/) ||
            line.match(/^(.+?)\s*(->|<->|--)\s*(.+)$/)
  if (!m) return null
  const [, from, arrow, rest] = m
  let to: string, protocol: string, description: string | undefined
  if (m[4] !== undefined) {
    to = rest
    const parts = m[4].split(',').map((s: string) => s.trim())
    protocol = parts[0]
    description = parts[1]
  } else {
    to = rest.trim()
    protocol = 'Others'
  }
  const direction: ConnectionDirection = arrow === '->' ? 'forward' : arrow === '<->' ? 'bidirectional' : 'none'
  return {
    from: from.trim(),
    to: to.trim(),
    direction,
    protocol: CONNECTION_PROTOCOLS.includes(protocol as any) ? protocol as ConnectionProtocol : protocol as ConnectionProtocol,
    ...(description ? { description } : {}),
    line: lineNum,
  }
}

export function parseBody(bodyText: string, lineOffset = 0): ParseResult {
  const lines = bodyText.split('\n')
  const zones: DiagramZone[] = []
  const connections: DiagramConnection[] = []
  const nodes: DiagramNode[] = []

  // stack of zones by depth
  const zoneStack: DiagramZone[] = []
  let inConnections = false

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const lineNum = i + 1 + lineOffset
    if (raw.trim() === '') continue

    // detect connection lines
    if (!inConnections && /->|<->|--/.test(raw) && !raw.trimStart().startsWith('-')) {
      inConnections = true
    }

    if (inConnections) {
      const conn = parseConnection(raw.trim(), lineNum)
      if (conn) connections.push(conn)
      continue
    }

    const indent = raw.match(/^(\s*)/)?.[1].length ?? 0
    const depth = indent / 2
    const trimmed = raw.trim()

    if (trimmed.startsWith('- ')) {
      // node belongs to zone at depth = indent/2
      // e.g. indent=2 → depth 1 → belongs to zoneStack[0]
      while (zoneStack.length > depth) zoneStack.pop()
      const zonePath = zoneStack.map(z => z.name)
      const node = parseNode(trimmed, lineNum, zonePath)
      nodes.push(node)
      if (zoneStack.length > 0) {
        zoneStack[zoneStack.length - 1].children.push(node)
      }
    } else if (trimmed.endsWith(':')) {
      // zone
      const name = trimmed.slice(0, -1)
      const zone: DiagramZone = { name, children: [], depth, line: lineNum }

      // pop stack to correct depth
      while (zoneStack.length > depth) zoneStack.pop()

      if (zoneStack.length === 0) {
        zones.push(zone)
      } else {
        zoneStack[zoneStack.length - 1].children.push(zone)
      }
      zoneStack.push(zone)
    }
  }

  return { zones, connections, nodes }
}
