import { describe, it, expect } from 'vitest'
import { useUndoStack } from '../useUndoStack'

describe('useUndoStack', () => {
  it('push and undo', () => {
    const stack = useUndoStack()
    stack.push('a')
    stack.push('b')
    stack.push('c')
    expect(stack.canUndo.value).toBe(true)
    expect(stack.undo()).toBe('b')
    expect(stack.undo()).toBe('a')
    expect(stack.undo()).toBeNull()
  })

  it('redo after undo', () => {
    const stack = useUndoStack()
    stack.push('a')
    stack.push('b')
    stack.push('c')
    stack.undo() // → b
    expect(stack.canRedo.value).toBe(true)
    expect(stack.redo()).toBe('c')
    expect(stack.redo()).toBeNull()
  })

  it('push after undo discards redo history', () => {
    const stack = useUndoStack()
    stack.push('a')
    stack.push('b')
    stack.push('c')
    stack.undo() // → b
    stack.push('d')
    expect(stack.redo()).toBeNull()
    expect(stack.undo()).toBe('b')
  })

  it('skips duplicate consecutive pushes', () => {
    const stack = useUndoStack()
    stack.push('a')
    stack.push('a')
    stack.push('a')
    expect(stack.canUndo.value).toBe(false)
  })

  it('reset clears history', () => {
    const stack = useUndoStack()
    stack.push('a')
    stack.push('b')
    stack.reset('x')
    expect(stack.canUndo.value).toBe(false)
    expect(stack.canRedo.value).toBe(false)
    expect(stack.undo()).toBeNull()
  })
})
