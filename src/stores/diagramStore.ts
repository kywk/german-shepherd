import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWorkspaceStore } from './workspaceStore'
import { parseNetworkDiagram } from '@/parser/index'

export const useDiagramStore = defineStore('diagram', () => {
  const workspaceStore = useWorkspaceStore()

  const lintEnabled = ref(true)
  const showTags = ref(true)

  const parsedResult = computed(() => parseNetworkDiagram(workspaceStore.currentRawText))
  const parsedDiagram = computed(() => parsedResult.value.diagram)
  const diagnostics = computed(() => parsedResult.value.diagnostics)
  const filteredDiagnostics = computed(() => lintEnabled.value ? diagnostics.value : [])

  return { lintEnabled, showTags, parsedDiagram, diagnostics, filteredDiagnostics }
})
