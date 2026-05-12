/**
 * Layout Graph Model — decoupled from both ELK.js and Vue Flow.
 * This is the intermediate representation between domain model and rendering.
 */

export interface LayoutNode {
  id: string
  width: number
  height: number
  /** Parent group ID (zone), undefined if top-level */
  parentId?: string
}

export interface LayoutEdge {
  id: string
  sourceId: string
  targetId: string
}

export interface LayoutGroup {
  id: string
  parentId?: string
  label: string
  depth: number
}

/** Input to the layout engine */
export interface LayoutGraph {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  groups: LayoutGroup[]
  direction: 'RIGHT' | 'DOWN'
}

/** Output from the layout engine — positioned graph */
export interface PositionedNode {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface PositionedEdge {
  id: string
  sourceId: string
  targetId: string
  /** Bend points for edge routing */
  points?: { x: number; y: number }[]
}

export interface PositionedGroup {
  id: string
  x: number
  y: number
  width: number
  height: number
  label: string
  depth: number
  parentId?: string
}

export interface LayoutResult {
  nodes: PositionedNode[]
  edges: PositionedEdge[]
  groups: PositionedGroup[]
  width: number
  height: number
}
