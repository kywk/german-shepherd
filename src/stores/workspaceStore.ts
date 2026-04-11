import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useDebounceFn } from '@vueuse/core'

const STORAGE_KEY = 'german-shepherd-workspaces'

const DEFAULT_CONTENT = `title: AP 2.0
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

export interface Workspace {
  id: string
  name: string
  content: string
  updatedAt: string
}

interface StorageData {
  workspaces: Workspace[]
  currentId: string
}

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() :
    Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function nowISO() { return new Date().toISOString() }

// Extract title from DSL header as workspace name
function extractTitle(content: string): string {
  const m = content.match(/^title:\s*(.+)$/m)
  return m ? m[1].trim() : 'Untitled'
}

export const useWorkspaceStore = defineStore('workspaces', () => {
  const workspaces = ref<Workspace[]>([])
  const currentId = ref<string>('')

  const currentWorkspace = computed(() =>
    workspaces.value.find(w => w.id === currentId.value) ?? null
  )

  const currentRawText = computed(() => currentWorkspace.value?.content ?? '')

  function init() {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const data: StorageData = JSON.parse(saved)
        workspaces.value = data.workspaces
        currentId.value = data.currentId
        if (!workspaces.value.find(w => w.id === currentId.value)) {
          currentId.value = workspaces.value[0]?.id ?? ''
        }
        return
      } catch { /* fall through */ }
    }
    // Create default workspace
    const ws: Workspace = { id: generateId(), name: 'AP 2.0 範例', content: DEFAULT_CONTENT, updatedAt: nowISO() }
    workspaces.value = [ws]
    currentId.value = ws.id
    persistNow()
  }

  function switchWorkspace(id: string) {
    if (workspaces.value.find(w => w.id === id)) {
      currentId.value = id
      persistNow()
    }
  }

  function createWorkspace(name?: string): string {
    const base = name ?? 'New Workspace'
    const existing = workspaces.value.map(w => w.name)
    let finalName = base
    let i = 2
    while (existing.includes(finalName)) finalName = `${base} ${i++}`
    const ws: Workspace = { id: generateId(), name: finalName, content: '', updatedAt: nowISO() }
    workspaces.value.push(ws)
    currentId.value = ws.id
    persist()
    return ws.id
  }

  function deleteWorkspace(id: string): boolean {
    if (workspaces.value.length <= 1) return false
    const idx = workspaces.value.findIndex(w => w.id === id)
    if (idx === -1) return false
    workspaces.value.splice(idx, 1)
    if (currentId.value === id) currentId.value = workspaces.value[0].id
    persistNow()
    return true
  }

  function updateCurrentRawText(text: string) {
    const ws = currentWorkspace.value
    if (!ws) return
    ws.content = text
    ws.name = extractTitle(text) || ws.name
    ws.updatedAt = nowISO()
    persist()
  }

  function persistNow() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ workspaces: workspaces.value, currentId: currentId.value }))
  }

  const persist = useDebounceFn(persistNow, 1000)

  return { workspaces, currentId, currentWorkspace, currentRawText, init, switchWorkspace, createWorkspace, deleteWorkspace, updateCurrentRawText }
})
