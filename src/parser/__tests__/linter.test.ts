import { describe, it, expect } from 'vitest'
import { lint } from '../linter'
import type { NetworkDiagram, DiagramNode, DiagramConnection } from '@/types/index'

function makeNode(name: string, type: string, line = 1): DiagramNode {
  return { id: name, name, type: type as any, zonePath: [], line }
}

function makeConn(from: string, to: string, protocol = 'HTTP', line = 10): DiagramConnection {
  return { from, to, direction: 'forward', protocol: protocol as any, line }
}

function makeDiagram(nodes: DiagramNode[], connections: DiagramConnection[]): NetworkDiagram {
  return { meta: { title: 'T', display: 'LR', theme: 'simple' }, zones: [], connections, nodes }
}

describe('lint', () => {
  it('無問題的乾淨輸入 → 空陣列', () => {
    const d = makeDiagram(
      [makeNode('A', 'Web'), makeNode('B', 'App')],
      [makeConn('A', 'B')]
    )
    expect(lint(d)).toEqual([])
  })

  it('孤立節點 → warning', () => {
    const d = makeDiagram([makeNode('A', 'Web'), makeNode('B', 'App')], [])
    const diags = lint(d)
    expect(diags.filter(d => d.rule === 'isolated-node')).toHaveLength(2)
    expect(diags[0].severity).toBe('warning')
  })

  it('連線引用不存在節點 → error', () => {
    const d = makeDiagram([makeNode('A', 'Web')], [makeConn('A', 'Ghost')])
    const diags = lint(d)
    expect(diags.some(d => d.rule === 'undefined-node-ref' && d.message.includes('Ghost'))).toBe(true)
    expect(diags.find(d => d.rule === 'undefined-node-ref')?.severity).toBe('error')
  })

  it('無效節點類型 → error', () => {
    const d = makeDiagram([makeNode('A', 'InvalidType'), makeNode('B', 'Web')], [makeConn('A', 'B')])
    const diags = lint(d)
    expect(diags.some(d => d.rule === 'invalid-node-type')).toBe(true)
    expect(diags.find(d => d.rule === 'invalid-node-type')?.severity).toBe('error')
  })

  it('無效 protocol → error', () => {
    const d = makeDiagram(
      [makeNode('A', 'Web'), makeNode('B', 'App')],
      [makeConn('A', 'B', 'INVALID')]
    )
    const diags = lint(d)
    expect(diags.some(d => d.rule === 'invalid-protocol')).toBe(true)
    expect(diags.find(d => d.rule === 'invalid-protocol')?.severity).toBe('error')
  })

  it('重複節點名稱 → error', () => {
    const d = makeDiagram(
      [makeNode('A', 'Web', 1), makeNode('A', 'App', 5)],
      [makeConn('A', 'A')]
    )
    const diags = lint(d)
    expect(diags.some(d => d.rule === 'duplicate-node')).toBe(true)
    expect(diags.find(d => d.rule === 'duplicate-node')?.severity).toBe('error')
  })

  it('max-depth-exceeded → error', () => {
    const zone = { name: 'Deep', children: [], depth: 3, line: 1 }
    const d: NetworkDiagram = { meta: { title: 'T', display: 'LR', theme: 'simple' }, zones: [zone], connections: [], nodes: [] }
    const diags = lint(d)
    expect(diags.some(d => d.rule === 'max-depth-exceeded')).toBe(true)
    expect(diags.find(d => d.rule === 'max-depth-exceeded')?.severity).toBe('error')
  })
})
