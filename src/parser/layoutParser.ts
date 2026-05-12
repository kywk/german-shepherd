/**
 * Layout code block parser/serializer.
 * Parses the last fenced code block (``` ... ```) in markdown into structured layout data,
 * and serializes layout data back to a code block string.
 */

export type Side = 'top' | 'bottom' | 'left' | 'right'

export interface LayoutNode {
  x: number
  y: number
}

export interface LayoutConnection {
  from: string
  to: string
  fromSide: Side
  toSide: Side
  waypoints: { x: number; y: number }[]
}

export interface LayoutData {
  nodes: Record<string, LayoutNode>
  connections: LayoutConnection[]
}

export function emptyLayout(): LayoutData {
  return { nodes: {}, connections: [] }
}

// ─── Parser ───

/**
 * Extract the last fenced code block content from markdown text.
 * Returns null if no trailing code block found.
 */
export function extractLayoutBlock(markdown: string): { content: string; startIndex: number; endIndex: number } | null {
  // Find last ``` pair — must be at end of document (only whitespace after closing ```)
  const lines = markdown.split('\n')
  let closeIdx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '```') {
      if (closeIdx === -1) {
        // Check only whitespace after this line
        const after = lines.slice(i + 1).join('').trim()
        if (after === '') { closeIdx = i; continue }
        else return null
      } else {
        // Found opening ```
        const content = lines.slice(i + 1, closeIdx).join('\n')
        const startIndex = lines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0)
        const endIndex = markdown.length
        return { content, startIndex, endIndex }
      }
    }
  }
  return null
}

/**
 * Parse layout YAML content into LayoutData.
 */
export function parseLayoutYaml(content: string): LayoutData {
  const data = emptyLayout()
  const lines = content.split('\n')
  let section: 'none' | 'nodes' | 'connections' = 'none'
  let currentNodeName = ''
  let currentConn: Partial<LayoutConnection> | null = null
  let inWaypoints = false

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.trim() === '') continue

    // Top-level keys
    if (line === 'nodes:') { section = 'nodes'; continue }
    if (line === 'connections:') {
      section = 'connections'
      if (currentConn) pushConn(data, currentConn)
      currentConn = null
      continue
    }

    if (section === 'nodes') {
      // Node name line: "  NodeName:" (2-space indent, ends with colon)
      const nameMatch = line.match(/^  ([^:].+):$/)
      if (nameMatch) { currentNodeName = nameMatch[1]; continue }
      // Property line: "    x: 123"
      const propMatch = line.match(/^\s{4}(\w+):\s*(.+)$/)
      if (propMatch && currentNodeName) {
        const [, key, val] = propMatch
        if (!data.nodes[currentNodeName]) data.nodes[currentNodeName] = { x: 0, y: 0 }
        if (key === 'x') data.nodes[currentNodeName].x = Number(val)
        if (key === 'y') data.nodes[currentNodeName].y = Number(val)
      }
    }

    if (section === 'connections') {
      // New connection item: "  - from: xxx"
      const itemMatch = line.match(/^\s{2}- from:\s*(.+)$/)
      if (itemMatch) {
        if (currentConn) pushConn(data, currentConn)
        currentConn = { from: itemMatch[1], waypoints: [] }
        inWaypoints = false
        continue
      }
      if (!currentConn) continue

      // Connection properties at 4-space indent
      const connProp = line.match(/^\s{4}(\w+):\s*(.+)$/)
      if (connProp) {
        const [, key, val] = connProp
        if (key === 'to') currentConn.to = val
        if (key === 'fromSide') currentConn.fromSide = val as Side
        if (key === 'toSide') currentConn.toSide = val as Side
        inWaypoints = false
        continue
      }

      // Waypoints array start
      if (line.match(/^\s{4}waypoints:$/)) { inWaypoints = true; continue }

      // Waypoint item: "      - x: 123"
      if (inWaypoints) {
        const wpStart = line.match(/^\s{6}- x:\s*(.+)$/)
        if (wpStart) {
          currentConn.waypoints!.push({ x: Number(wpStart[1]), y: 0 })
          continue
        }
        const wpY = line.match(/^\s{8}y:\s*(.+)$/)
        if (wpY && currentConn.waypoints!.length > 0) {
          currentConn.waypoints![currentConn.waypoints!.length - 1].y = Number(wpY[1])
        }
      }
    }
  }

  if (currentConn) pushConn(data, currentConn)
  return data
}

function pushConn(data: LayoutData, conn: Partial<LayoutConnection>) {
  if (conn.from && conn.to) {
    data.connections.push({
      from: conn.from,
      to: conn.to,
      fromSide: conn.fromSide ?? 'right',
      toSide: conn.toSide ?? 'left',
      waypoints: conn.waypoints ?? [],
    })
  }
}

/**
 * Parse layout from full markdown text.
 */
export function parseLayout(markdown: string): LayoutData | null {
  const block = extractLayoutBlock(markdown)
  if (!block) return null
  return parseLayoutYaml(block.content)
}

// ─── Serializer ───

/**
 * Serialize LayoutData to YAML string (without the ``` fences).
 */
export function serializeLayout(data: LayoutData): string {
  const lines: string[] = []

  const nodeNames = Object.keys(data.nodes)
  if (nodeNames.length > 0) {
    lines.push('nodes:')
    for (const name of nodeNames) {
      const n = data.nodes[name]
      lines.push(`  ${name}:`)
      lines.push(`    x: ${Math.round(n.x)}`)
      lines.push(`    y: ${Math.round(n.y)}`)
    }
  }

  if (data.connections.length > 0) {
    lines.push('connections:')
    for (const c of data.connections) {
      lines.push(`  - from: ${c.from}`)
      lines.push(`    to: ${c.to}`)
      lines.push(`    fromSide: ${c.fromSide}`)
      lines.push(`    toSide: ${c.toSide}`)
      if (c.waypoints.length > 0) {
        lines.push('    waypoints:')
        for (const wp of c.waypoints) {
          lines.push(`      - x: ${Math.round(wp.x)}`)
          lines.push(`        y: ${Math.round(wp.y)}`)
        }
      }
    }
  }

  return lines.join('\n')
}

/**
 * Serialize LayoutData to a fenced code block string.
 */
export function serializeLayoutBlock(data: LayoutData): string {
  return '```\n' + serializeLayout(data) + '\n```'
}

/**
 * Update markdown text: replace or append layout code block.
 */
export function updateMarkdownLayout(markdown: string, data: LayoutData): string {
  const block = extractLayoutBlock(markdown)
  const newBlock = serializeLayoutBlock(data)

  if (block) {
    return markdown.slice(0, block.startIndex).trimEnd() + '\n\n' + newBlock
  }
  return markdown.trimEnd() + '\n\n' + newBlock
}

/**
 * Remove layout code block from markdown.
 */
export function removeLayoutBlock(markdown: string): string {
  const block = extractLayoutBlock(markdown)
  if (!block) return markdown
  return markdown.slice(0, block.startIndex).trimEnd()
}
