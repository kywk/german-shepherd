import { describe, it, expect } from 'vitest'
import { parseBody } from '../diagramParser'
import { parseNetworkDiagram } from '../index'

const FULL_EXAMPLE = `title: AP 2.0
display: LR
theme: icon
---
Internet:
  - AP 2.0, Web
  - NS Agent Pro, App

DMZ1:
  - FlashLight, Web Server
  - AP IDP, Web Server

DMZ2:
  MASA:
    - Auth, AP Server
    - Agency Service, AP Server
    - NAS, Storage
  - PQM, AP Server, #核心系統

Intranet:
  - EDW, SAP, #核心系統
  - ECM, AP Server
  - CRM, SAP, #核心系統 #將汰換

AP 2.0 -> AP IDP: HTTP, 登入
AP 2.0 -> FlashLight: HTTP
FlashLight -> Agency Service: HTTP
NS Agent Pro -> Auth: HTTP
Auth -> AP IDP: HTTP, 驗證帳密
NS Agent Pro -> Agency Service: HTTP
Agency Service -> PQM: HTTP
Agency Service -> NAS: Others, 掛載
Agency Service -> EDW: RFC
Agency Service -> ECM: HTTP`

describe('parseBody', () => {
  it('空輸入', () => {
    const r = parseBody('')
    expect(r.zones).toEqual([])
    expect(r.connections).toEqual([])
    expect(r.nodes).toEqual([])
  })

  it('基本 zone + node', () => {
    const r = parseBody('Internet:\n  - AP 2.0, Web\n')
    expect(r.zones).toHaveLength(1)
    expect(r.zones[0].name).toBe('Internet')
    expect(r.nodes).toHaveLength(1)
    expect(r.nodes[0].name).toBe('AP 2.0')
    expect(r.nodes[0].type).toBe('Web')
    expect(r.nodes[0].zonePath).toEqual(['Internet'])
  })

  it('巢狀子區塊 2 層', () => {
    const r = parseBody('DMZ2:\n  MASA:\n    - Auth, AP Server\n')
    expect(r.zones[0].name).toBe('DMZ2')
    expect(r.zones[0].depth).toBe(0)
    const sub = r.zones[0].children[0] as any
    expect(sub.name).toBe('MASA')
    expect(sub.depth).toBe(1)
    expect(r.nodes[0].zonePath).toEqual(['DMZ2', 'MASA'])
  })

  it('節點帶特殊註記', () => {
    const r = parseBody('Z:\n  - MyNode, Database, 特殊備註\n')
    expect(r.nodes[0].note).toBe('特殊備註')
  })

  it('節點帶單個標籤', () => {
    const r = parseBody('Z:\n  - PQM, AP Server, #核心系統\n')
    expect(r.nodes[0].tags).toEqual(['核心系統'])
  })

  it('節點帶多個標籤', () => {
    const r = parseBody('Z:\n  - CRM, SAP, #核心系統 #將汰換\n')
    expect(r.nodes[0].tags).toEqual(['核心系統', '將汰換'])
  })

  it('三種連線方向', () => {
    const body = 'Z:\n  - A, Web\n  - B, App\n\nA -> B: HTTP\nA <-> B: HTTP\nA -- B: HTTP\n'
    const r = parseBody(body)
    expect(r.connections[0].direction).toBe('forward')
    expect(r.connections[1].direction).toBe('bidirectional')
    expect(r.connections[2].direction).toBe('none')
  })

  it('連線帶 description', () => {
    const r = parseBody('Z:\n  - A, Web\n  - B, App\n\nA -> B: HTTP, 登入\n')
    expect(r.connections[0].protocol).toBe('HTTP')
    expect(r.connections[0].description).toBe('登入')
  })

  it('連線不帶 description', () => {
    const r = parseBody('Z:\n  - A, Web\n  - B, App\n\nA -> B: HTTP\n')
    expect(r.connections[0].description).toBeUndefined()
  })

  it('完整範例輸入', () => {
    const { diagram } = parseNetworkDiagram(FULL_EXAMPLE)
    expect(diagram.meta.title).toBe('AP 2.0')
    expect(diagram.meta.display).toBe('LR')
    expect(diagram.meta.theme).toBe('icon')
    expect(diagram.zones).toHaveLength(4)
    expect(diagram.nodes).toHaveLength(11)
    expect(diagram.connections).toHaveLength(10)
    // CRM has two tags
    const crm = diagram.nodes.find(n => n.name === 'CRM')
    expect(crm?.tags).toEqual(['核心系統', '將汰換'])
    // PQM is in DMZ2 (not MASA)
    const pqm = diagram.nodes.find(n => n.name === 'PQM')
    expect(pqm?.zonePath).toEqual(['DMZ2'])
    expect(pqm?.tags).toEqual(['核心系統'])
  })
})

describe('parseNetworkDiagram', () => {
  it('空輸入回傳空狀態', () => {
    const { diagram, diagnostics } = parseNetworkDiagram('')
    expect(diagram.zones).toEqual([])
    expect(diagnostics).toEqual([])
  })

  it('無 --- 分隔符回傳空狀態', () => {
    const { diagram } = parseNetworkDiagram('title: Test\nInternet:\n  - A, Web\n')
    expect(diagram.zones).toEqual([])
  })

  it('僅 header', () => {
    const { diagram } = parseNetworkDiagram('title: Test\ndisplay: TD\n---\n')
    expect(diagram.meta.title).toBe('Test')
    expect(diagram.meta.display).toBe('TD')
    expect(diagram.zones).toEqual([])
  })
})
