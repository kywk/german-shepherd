// ===== Metadata =====
export interface DiagramMeta {
  title: string
  display: 'TD' | 'LR' // 預設 LR
  theme: 'simple' | 'icon' | 'image' // 預設 simple
}

// ===== 節點類型 =====
export const NODE_TYPES = [
  'App', 'Web', // 客戶端
  'Firewall', 'WAF', 'F5', 'Storage', // 網路設備
  'AP Server', 'Web Server', 'SAP', 'Database', // 服務器
] as const
export type NodeType = typeof NODE_TYPES[number]

export const NODE_TYPE_CATEGORY: Record<NodeType, 'client' | 'network' | 'server'> = {
  'App': 'client', 'Web': 'client',
  'Firewall': 'network', 'WAF': 'network', 'F5': 'network', 'Storage': 'network',
  'AP Server': 'server', 'Web Server': 'server', 'SAP': 'server', 'Database': 'server',
}

// ===== 通訊方式 =====
export const CONNECTION_PROTOCOLS = [
  'HTTP', 'SOAP', 'WebSocket', 'gRPC', 'RFC', 'FTP', 'Socket', 'Others',
] as const
export type ConnectionProtocol = typeof CONNECTION_PROTOCOLS[number]

// ===== 連線方向 =====
export type ConnectionDirection = 'forward' | 'bidirectional' | 'none'

// ===== 節點 =====
export interface DiagramNode {
  id: string // 基於名稱生成
  name: string // 節點名稱（唯一）
  type: NodeType
  note?: string // 特殊註記
  tags?: string[] // 標籤 (如 ['核心系統'])
  zonePath: string[] // 所屬區段路徑 ['DMZ2', 'MASA']
  line: number // 原始文字行號 (1-indexed)
}

// ===== 區段 =====
export interface DiagramZone {
  name: string
  children: (DiagramZone | DiagramNode)[]
  depth: number // 0=root, 1=sub, 2=sub-sub (最多3層)
  line: number
}

// 型別守衛
export function isZone(child: DiagramZone | DiagramNode): child is DiagramZone {
  return 'children' in child
}

// ===== 連線 =====
export interface DiagramConnection {
  from: string
  to: string
  direction: ConnectionDirection
  protocol: ConnectionProtocol
  description?: string
  line: number
}

// ===== 完整架構圖 =====
export interface NetworkDiagram {
  meta: DiagramMeta
  zones: DiagramZone[]
  connections: DiagramConnection[]
  nodes: DiagramNode[] // flat list
  zoneNames: Set<string> // flat set of all zone names (for group-level connections)
}

// ===== Lint =====
export type LintSeverity = 'error' | 'warning' | 'info'

export interface LintDiagnostic {
  line: number
  column: number
  endColumn?: number
  message: string
  severity: LintSeverity
  rule: string // 如 'isolated-node', 'unknown-type'
}

// ===== Diff (預留) =====
export type DiffState = 'added' | 'removed' | 'modified' | 'unchanged'

// ===== Font Awesome Icon 對照 =====
export const NODE_TYPE_ICONS: Record<NodeType, string> = {
  'App': 'fa-solid fa-mobile-screen',
  'Web': 'fa-solid fa-globe',
  'Firewall': 'fa-solid fa-shield-halved',
  'WAF': 'fa-solid fa-shield',
  'F5': 'fa-solid fa-arrows-split-up-and-left',
  'Storage': 'fa-solid fa-hard-drive',
  'AP Server': 'fa-solid fa-server',
  'Web Server': 'fa-solid fa-server',
  'SAP': 'fa-solid fa-building',
  'Database': 'fa-solid fa-database',
}
