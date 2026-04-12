import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWorkspaceStore } from './workspaceStore'
import { parseNetworkDiagram } from '@/parser/index'
import { computeDiff, mergeDiagramText } from '@/composables/useDiff'

export const useDiagramStore = defineStore('diagram', () => {
  const workspaceStore = useWorkspaceStore()

  const lintEnabled = ref(true)
  const showTags = ref(true)

  // Normal mode
  const parsedResult = computed(() => parseNetworkDiagram(workspaceStore.currentRawText))
  const parsedDiagram = computed(() => parsedResult.value.diagram)
  const diagnostics = computed(() => parsedResult.value.diagnostics)
  const filteredDiagnostics = computed(() => lintEnabled.value ? diagnostics.value : [])

  // Diff mode
  const diffMode = ref(false)
  const diffUpperText = ref('')
  const diffLowerText = ref('')

  const parsedUpper = computed(() => parseNetworkDiagram(diffUpperText.value))
  const parsedLower = computed(() => parseNetworkDiagram(diffLowerText.value))

  const diffResult = computed(() => {
    if (!diffMode.value) return null
    return computeDiff(parsedUpper.value.diagram, parsedLower.value.diagram)
  })

  function enterDiff() {
    const text = workspaceStore.currentRawText
    diffUpperText.value = text
    diffLowerText.value = text
    diffMode.value = true
  }

  function exitDiff() {
    diffMode.value = false
  }

  function mergeDiff() {
    const merged = mergeDiagramText(
      diffUpperText.value, diffLowerText.value,
      parsedUpper.value.diagram, parsedLower.value.diagram
    )
    workspaceStore.updateCurrentRawText(merged)
    diffMode.value = false
  }

  return {
    lintEnabled, showTags,
    parsedDiagram, diagnostics, filteredDiagnostics,
    diffMode, diffUpperText, diffLowerText, diffResult,
    enterDiff, exitDiff, mergeDiff,
  }
})
