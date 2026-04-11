import type { DiagramMeta } from '@/types/index'

export function parseMeta(headerText: string): DiagramMeta {
  const meta: DiagramMeta = { title: '', display: 'LR', theme: 'simple' }
  for (const line of headerText.split('\n')) {
    const m = line.match(/^(\w+):\s*(.+)$/)
    if (!m) continue
    const [, key, val] = m
    if (key === 'title') meta.title = val.trim()
    else if (key === 'display' && (val === 'TD' || val === 'LR')) meta.display = val
    else if (key === 'theme' && (val === 'simple' || val === 'icon' || val === 'image')) meta.theme = val
  }
  return meta
}
