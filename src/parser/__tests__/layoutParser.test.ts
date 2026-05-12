import { describe, it, expect } from 'vitest'
import {
  extractLayoutBlock,
  parseLayoutYaml,
  parseLayout,
  serializeLayout,
  serializeLayoutBlock,
  updateMarkdownLayout,
  removeLayoutBlock,
} from '../layoutParser'

const sampleYaml = `nodes:
  AP 2.0:
    x: 100
    y: 200
  FlashLight:
    x: 300
    y: 150
connections:
  - from: AP 2.0
    to: FlashLight
    fromSide: right
    toSide: left
    waypoints:
      - x: 200
        y: 200
      - x: 200
        y: 150`

const sampleMarkdown = `title: Test
---
Internet:
  - AP 2.0, Web

\`\`\`
${sampleYaml}
\`\`\``

describe('extractLayoutBlock', () => {
  it('extracts trailing code block', () => {
    const result = extractLayoutBlock(sampleMarkdown)
    expect(result).not.toBeNull()
    expect(result!.content).toBe(sampleYaml)
  })

  it('returns null when no code block', () => {
    expect(extractLayoutBlock('just text')).toBeNull()
  })

  it('returns null when code block is not at end', () => {
    const md = '```\nfoo\n```\nmore text after'
    expect(extractLayoutBlock(md)).toBeNull()
  })
})

describe('parseLayoutYaml', () => {
  it('parses nodes', () => {
    const data = parseLayoutYaml(sampleYaml)
    expect(data.nodes['AP 2.0']).toEqual({ x: 100, y: 200 })
    expect(data.nodes['FlashLight']).toEqual({ x: 300, y: 150 })
  })

  it('parses connections with waypoints', () => {
    const data = parseLayoutYaml(sampleYaml)
    expect(data.connections).toHaveLength(1)
    const c = data.connections[0]
    expect(c.from).toBe('AP 2.0')
    expect(c.to).toBe('FlashLight')
    expect(c.fromSide).toBe('right')
    expect(c.toSide).toBe('left')
    expect(c.waypoints).toEqual([{ x: 200, y: 200 }, { x: 200, y: 150 }])
  })
})

describe('parseLayout', () => {
  it('parses from full markdown', () => {
    const data = parseLayout(sampleMarkdown)
    expect(data).not.toBeNull()
    expect(Object.keys(data!.nodes)).toHaveLength(2)
    expect(data!.connections).toHaveLength(1)
  })
})

describe('serializeLayout', () => {
  it('round-trips correctly', () => {
    const data = parseLayoutYaml(sampleYaml)
    const serialized = serializeLayout(data)
    const reparsed = parseLayoutYaml(serialized)
    expect(reparsed.nodes).toEqual(data.nodes)
    expect(reparsed.connections).toEqual(data.connections)
  })
})

describe('updateMarkdownLayout', () => {
  it('replaces existing code block', () => {
    const data = parseLayout(sampleMarkdown)!
    data.nodes['AP 2.0'].x = 999
    const updated = updateMarkdownLayout(sampleMarkdown, data)
    const reparsed = parseLayout(updated)!
    expect(reparsed.nodes['AP 2.0'].x).toBe(999)
  })

  it('appends code block when none exists', () => {
    const md = 'title: Test\n---\nsome content'
    const data = { nodes: { Foo: { x: 10, y: 20 } }, connections: [] }
    const updated = updateMarkdownLayout(md, data)
    expect(updated).toContain('```')
    const reparsed = parseLayout(updated)!
    expect(reparsed.nodes['Foo']).toEqual({ x: 10, y: 20 })
  })
})

describe('removeLayoutBlock', () => {
  it('removes trailing code block', () => {
    const result = removeLayoutBlock(sampleMarkdown)
    expect(result).not.toContain('```')
    expect(result).toContain('AP 2.0, Web')
  })
})
