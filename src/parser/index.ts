import type { NetworkDiagram, LintDiagnostic } from '@/types/index'
import { parseMeta } from './metaParser'
import { parseBody } from './diagramParser'
import { lint } from './linter'

export function parseNetworkDiagram(rawText: string): { diagram: NetworkDiagram, diagnostics: LintDiagnostic[] } {
  const empty: NetworkDiagram = { meta: { title: '', display: 'LR', theme: 'simple' }, zones: [], connections: [], nodes: [] }

  if (!rawText.trim() || !rawText.includes('---')) {
    return { diagram: empty, diagnostics: [] }
  }

  const idx = rawText.indexOf('---')
  const headerText = rawText.slice(0, idx)
  const bodyText = rawText.slice(idx + 3)
  const bodyLineOffset = rawText.slice(0, idx + 3).split('\n').length - 1

  const meta = parseMeta(headerText)
  const { zones, connections, nodes } = parseBody(bodyText, bodyLineOffset)
  const diagram: NetworkDiagram = { meta, zones, connections, nodes }
  const diagnostics = lint(diagram)

  return { diagram, diagnostics }
}
