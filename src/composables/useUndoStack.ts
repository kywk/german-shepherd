import { ref } from 'vue'

export interface UndoStack {
  /** Push a new snapshot (call before or after mutation) */
  push(snapshot: string): void
  /** Undo: returns previous snapshot or null */
  undo(): string | null
  /** Redo: returns next snapshot or null */
  redo(): string | null
  /** Whether undo is available */
  canUndo: ReturnType<typeof ref<boolean>>
  /** Whether redo is available */
  canRedo: ReturnType<typeof ref<boolean>>
  /** Reset the stack with an initial snapshot */
  reset(snapshot: string): void
}

const MAX_HISTORY = 100

export function useUndoStack(): UndoStack {
  const stack = ref<string[]>([])
  const pointer = ref(-1)
  const canUndo = ref(false)
  const canRedo = ref(false)

  function updateFlags() {
    canUndo.value = pointer.value > 0
    canRedo.value = pointer.value < stack.value.length - 1
  }

  function push(snapshot: string) {
    // If current snapshot is same as top, skip
    if (pointer.value >= 0 && stack.value[pointer.value] === snapshot) return

    // Discard any redo history
    stack.value = stack.value.slice(0, pointer.value + 1)
    stack.value.push(snapshot)

    // Trim old history
    if (stack.value.length > MAX_HISTORY) {
      stack.value = stack.value.slice(stack.value.length - MAX_HISTORY)
    }

    pointer.value = stack.value.length - 1
    updateFlags()
  }

  function undo(): string | null {
    if (pointer.value <= 0) return null
    pointer.value--
    updateFlags()
    return stack.value[pointer.value]
  }

  function redo(): string | null {
    if (pointer.value >= stack.value.length - 1) return null
    pointer.value++
    updateFlags()
    return stack.value[pointer.value]
  }

  function reset(snapshot: string) {
    stack.value = [snapshot]
    pointer.value = 0
    updateFlags()
  }

  return { push, undo, redo, canUndo, canRedo, reset }
}
