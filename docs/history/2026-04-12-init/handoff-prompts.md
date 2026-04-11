# German-Shepherd — Sub-Agent Handoff Prompts

本文件將 German-Shepherd 的實作分為 **5 個獨立 sub-agent 任務**，各自可交由不同 AI agent 執行。
任務間有依賴順序，請依照 Agent A → B → C/D 並行 → E 的順序執行。

```
Agent A (Scaffolding + Types)
    ↓
Agent B (Parser + Linter + Tests)
    ↓
Agent C (Stores + Editor UI)  ←── 可與 D 並行
Agent D (Diagram Renderer)    ←── 可與 C 並行
    ↓
Agent E (Integration + Polish)
```

---

## Agent A: 專案初始化 + 資料型別

### 任務目標
初始化 Vue 3 + Vite + TypeScript 專案，建立 CSS 設計系統，定義所有核心資料型別。

### Prompt

```
你要幫我初始化一個名為 german-shepherd 的 Vue.js 專案。

## 專案背景
German-Shepherd 是一個純前端 SPA，用來編輯和視覺化「資訊系統網路架構圖」。
使用者在左側編輯區用自定義 DSL 語法描述架構，右側即時渲染 SVG 架構圖。
UI 風格需沿用同團隊的 border-collie 專案（~/workspace/sheltie/border-collie）。

## 任務 1: 專案初始化

1. 在專案根目錄使用 Vite 初始化 Vue + TypeScript 專案
   - 先 `npx -y create-vite@latest --help` 看可用選項
   - 用 `npx -y create-vite@latest ./ --template vue-ts` 初始化
2. 安裝 dependencies:
   - vue, pinia, @vueuse/core
3. 安裝 devDependencies:
   - vitest, @vue/test-utils, happy-dom
4. 設定 vite.config.ts:
   - `@` alias 指向 src/
   - base path: `process.env.GITHUB_ACTIONS ? '/german-shepherd/' : './'`
5. 設定 tsconfig.json: paths alias `@/*` → `src/*`

## 任務 2: CSS 設計系統

1. 將 ~/workspace/sheltie/border-collie/src/shared/styles/variables.css 
   **複製** 到 src/assets/variables.css（獨立部署用）
2. 建立 src/assets/main.css:
   - @import variables.css
   - 加入 German-Shepherd 特有的 CSS 變數:
     ```css
     /* Zone colors - 網路區段配色 */
     --zone-color-1: hsl(210, 50%, 25%);
     --zone-color-2: hsl(180, 50%, 25%);
     --zone-color-3: hsl(150, 50%, 25%);
     --zone-color-4: hsl(270, 50%, 25%);
     --zone-color-5: hsl(30, 50%, 25%);
     --zone-color-6: hsl(330, 50%, 25%);
     /* 對應 light theme 也需一組 */
     
     /* Node type colors */
     --node-client: hsl(210, 70%, 60%);
     --node-network: hsl(30, 70%, 60%);
     --node-server: hsl(150, 70%, 60%);
     
     /* Connection colors */
     --conn-default: var(--color-text-muted);
     --conn-highlight: var(--color-accent);
     
     /* Lint */
     --lint-error: var(--color-error);
     --lint-warning: var(--color-warning);
     --lint-info: var(--color-accent);
     
     /* Diff (預留) */
     --diff-added: hsl(150, 70%, 45%);
     --diff-removed: hsl(0, 70%, 55%);
     --diff-modified: hsl(45, 80%, 55%);
     ```
   - 複製 border-collie 的 main.css 中的通用樣式:
     panel, panel-header, panel-content, btn, btn-primary, btn-ghost,
     toggle-group, editor-textarea, scrollbar, theme-toggle, brand-logo 等
3. 更新 index.html:
   - title: "German Shepherd - 資訊系統網路架構圖"
   - 載入 Google Fonts: Inter + JetBrains Mono
   - 載入 Font Awesome 6 Free CDN
   - 合適的 meta description

## 任務 3: 核心資料型別

建立 src/types/index.ts，定義以下 interface/type:

```typescript
// ===== Metadata =====
export interface DiagramMeta {
  title: string
  display: 'TD' | 'LR'                        // 預設 LR
  theme: 'simple' | 'icon' | 'image'          // 預設 simple
}

// ===== 節點類型 =====
export const NODE_TYPES = [
  'App', 'Web',                                 // 客戶端
  'Firewall', 'WAF', 'F5', 'Storage',          // 網路設備
  'AP Server', 'Web Server', 'SAP', 'Database'  // 服務器
] as const
export type NodeType = typeof NODE_TYPES[number]

export const NODE_TYPE_CATEGORY: Record<NodeType, 'client' | 'network' | 'server'> = {
  'App': 'client', 'Web': 'client',
  'Firewall': 'network', 'WAF': 'network', 'F5': 'network', 'Storage': 'network',
  'AP Server': 'server', 'Web Server': 'server', 'SAP': 'server', 'Database': 'server'
}

// ===== 通訊方式 =====
export const CONNECTION_PROTOCOLS = [
  'HTTP', 'SOAP', 'WebSocket', 'gRPC', 'RFC', 'FTP', 'Socket', 'Others'
] as const
export type ConnectionProtocol = typeof CONNECTION_PROTOCOLS[number]

// ===== 連線方向 =====
export type ConnectionDirection = 'forward' | 'bidirectional' | 'none'

// ===== 節點 =====
export interface DiagramNode {
  id: string              // 基於名稱生成
  name: string            // 節點名稱（唯一）
  type: NodeType
  note?: string           // 特殊註記
  tags?: string[]         // 標籤 (如 ['核心系統'])
  zonePath: string[]      // 所屬區段路徑 ['DMZ2', 'MASA']
  line: number            // 原始文字行號 (1-indexed)
}

// ===== 區段 =====
export interface DiagramZone {
  name: string
  children: (DiagramZone | DiagramNode)[]
  depth: number           // 0=root, 1=sub, 2=sub-sub (最多3層)
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
  nodes: DiagramNode[]     // flat list
}

// ===== Lint =====
export type LintSeverity = 'error' | 'warning' | 'info'

export interface LintDiagnostic {
  line: number
  column: number
  endColumn?: number
  message: string
  severity: LintSeverity
  rule: string              // 如 'isolated-node', 'unknown-type'
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
  'Database': 'fa-solid fa-database'
}
```

## 完成條件
- `npm run dev` 能正常啟動且顯示空白 Vue app
- CSS 變數載入正確（dark/light 主題變數可用）
- TypeScript 型別無報錯
- Font Awesome icons 可在頁面中渲染

## 產出檔案
- package.json, vite.config.ts, tsconfig.json, index.html
- src/main.ts, src/App.vue (最小骨架)
- src/assets/variables.css, src/assets/main.css
- src/types/index.ts
```

---

## Agent B: Parser + Linter + 單元測試

### 任務目標
實作 DSL 語法的 parser 和 linter，含完整單元測試。此模組為純邏輯，不涉及 UI。

### 前置條件
Agent A 已完成，`src/types/index.ts` 已存在。

### Prompt

```
你要為 german-shepherd 專案實作 DSL 語法的 parser 和 linter。
這是純邏輯模組，不涉及 UI，需包含完整單元測試。

## 專案背景
使用者用自定義 DSL 語法描述「資訊系統網路架構圖」，parser 需將原始文字
解析為結構化的 NetworkDiagram 資料模型。

## DSL 語法規格

文件分為兩段，以 `---` 分隔：

### Header (--- 之前):
```
title: AP 2.0
display: LR
theme: icon
```
- title: 架構圖標題（必填）
- display: TD 或 LR（預設 LR）
- theme: simple / icon / image（預設 simple）

### Body (--- 之後):
分為「區段/節點定義」和「連線定義」兩部分（以空行分隔邏輯區塊）。

#### 區段 & 節點:
- 以縮排判斷結構（**2 spaces** 為一級）
- 無縮排 + 結尾 `:` → 頂層區段 (depth 0)
- 有縮排 + 結尾 `:` (不含 `- ` 前綴) → 子區塊 (depth +1)
  - **但是** 如果有 `- ` 前綴 + 結尾 `:` → 也是子區塊
- 最多 3 層巢狀（depth 0, 1, 2）
- `- name, type` 開頭 → 節點

#### 節點格式:
```
- 名稱, 類型, 特殊註記, #tag1 #tag2
```
- 名稱 + 類型：必填
- 特殊註記：可選，普通文字（不以 # 開頭的第 3 個逗號分隔欄位）
- 標籤：可選，以 `#` 前綴辨識，同一逗號欄位可有多個（空格分隔）
- 解析邏輯：用逗號分割後，逐欄位判斷：
  1. 第一欄 = name（去掉 `- ` 前綴）
  2. 第二欄 = type
  3. 之後的欄位：若包含 `#` → 提取所有 #tag；否則 → note

#### 連線格式:
```
A -> B: protocol, description
A <-> B: protocol, description
A -- B: protocol, description
```
- `->` → forward（單向）
- `<->` → bidirectional（雙向）
- `--` → none（無方向）
- description 可選
- 連線使用**完整節點名稱**匹配（大小寫敏感）

## 範例輸入

```
title: AP 2.0
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
Agency Service -> ECM: HTTP
```

## 要實作的檔案

### src/parser/metaParser.ts
- `parseMeta(headerText: string): DiagramMeta`
- 解析 `---` 前的 header 區段
- 缺省值: display='LR', theme='simple'

### src/parser/diagramParser.ts
- `parseBody(bodyText: string): { zones: DiagramZone[], connections: DiagramConnection[], nodes: DiagramNode[] }`
- 解析 `---` 後的 body 區段
- nodes 為所有節點的 flat list（從 zones 遞迴提取）

### src/parser/linter.ts
- `lint(diagram: NetworkDiagram): LintDiagnostic[]`
- 檢查規則：
  1. `isolated-node`: 節點未出現在任何連線中 → warning
  2. `undefined-node-ref`: 連線引用不存在的節點 → error
  3. `invalid-node-type`: 節點類型不在 NODE_TYPES 列表中 → error
  4. `invalid-protocol`: 連線 protocol 不在 CONNECTION_PROTOCOLS 列表中 → error
  5. `duplicate-node`: 同名節點重複定義 → error
  6. `max-depth-exceeded`: 子區塊超過 3 層 → error

### src/parser/index.ts
- 統一入口：
  ```typescript
  export function parseNetworkDiagram(rawText: string): {
    diagram: NetworkDiagram
    diagnostics: LintDiagnostic[]
  }
  ```
- 處理 `---` 分割
- 呼叫 metaParser + diagramParser + linter
- 若 rawText 為空或無 `---`，回傳合理的空狀態

### src/parser/__tests__/diagramParser.test.ts
測試案例至少包含：
- 空輸入
- 僅 header
- 基本 zone + node
- 巢狀子區塊 1~3 層
- 超過 3 層 → lint error
- 節點帶特殊註記
- 節點帶標籤（單個 / 多個）
- 三種連線方向 (->, <->, --)
- 連線帶/不帶 description
- 完整範例輸入

### src/parser/__tests__/linter.test.ts
測試案例至少包含：
- 孤立節點 → warning
- 連線引用不存在節點 → error
- 無效節點類型 → error
- 無效 protocol → error
- 重複節點名稱 → error
- 無 lint 問題的乾淨輸入 → 空陣列

## 重要事項
- 所有型別從 `@/types/index.ts` import
- Parser 需要記錄每個節點/區段/連線的原始行號 (line, 1-indexed)
- 不需要實作 UI，只需要純邏輯 + 測試
- 用 vitest 執行測試: `npx vitest run`

## 完成條件
- 所有測試通過
- 範例輸入能正確解析出完整的 NetworkDiagram
- Lint 規則正確觸發
```

---

## Agent C: State Management + Editor UI

### 任務目標
實作 Pinia stores（workspace + diagram）及編輯區相關 UI 元件。

### 前置條件
Agent A + B 已完成。

### Prompt

```
你要為 german-shepherd 專案實作狀態管理和編輯區 UI 元件。

## 專案背景
German-Shepherd 是一個類似 Markdown 編輯器的左右分割介面。
左側是 DSL 文字編輯區，右側是 SVG 架構圖（由 Agent D 實作）。
本任務負責左側編輯區及資料管理。

## 參考專案
border-collie (~/workspace/sheltie/border-collie) 已有完整的：
- SplitPane.vue → 左右分割、可拖曳、可 toggle 滿版
- WorkspaceDropdown.vue → 多工作區管理 UI
- workspaceStore.ts → Pinia + localStorage 持久化
- EditorPanel.vue → 編輯面板佈局
- TextEditor.vue / TextEditorWithStore.vue → 文字編輯器

**請直接參考並改寫 border-collie 的實作**，保持相似的程式架構和 UI 風格。

## 要實作的檔案

### src/stores/workspaceStore.ts
參考 border-collie/src/stores/workspaceStore.ts，改寫為：
- localStorage key: `german-shepherd-workspaces`
- 資料結構沿用 border-collie 的 Workspace interface
  （id, frontmatter: { name, ... }, content, updatedAt）
- 提供 frontmatter 解析功能（header 用 title 作為 name）
- 預設工作區：包含完整範例文字（spec-discussion.md 中的 Example）
- 功能: init, switchWorkspace, createWorkspace, deleteWorkspace,
  updateCurrentRawText, updateCurrentContent, persist (throttled)

### src/stores/diagramStore.ts
- 引入 workspaceStore 的 currentRawText
- `parsedDiagram` (computed): 呼叫 parseNetworkDiagram() 即時解析
  - 使用 watchEffect 或直接 computed
- `diagnostics` (computed): 從 parse 結果取得
- `lintEnabled` (ref, default true): lint 開關
- `filteredDiagnostics` (computed): lintEnabled ? diagnostics : []
- `showTags` (ref, default true): 檢視區標籤顯示開關

### src/components/SplitPane.vue
- 直接複製 border-collie/src/components/SplitPane.vue
- 僅修改中文文字（如 '展開編輯區' → 保持不變，兩個專案語言一致）

### src/components/WorkspaceDropdown.vue
- 參考 border-collie/src/components/WorkspaceDropdown.vue
- 移除 gist/source 相關功能（german-shepherd 不需要）
- 保留：工作區列表、切換、新增、刪除、確認對話框

### src/components/ConfirmDialog.vue
- 直接複製 border-collie/src/components/ConfirmDialog.vue

### src/components/EditorPanel.vue
- 頂部 toolbar（panel-header）:
  - 左側: WorkspaceDropdown
  - 右側: Lint 開關 toggle（btn-ghost + checkbox 風格）
- 內容（panel-content）: TextEditor

### src/components/TextEditor.vue
- 左側行號欄 + 右側 textarea 的佈局
- 行號欄：
  - 等寬字型 (JetBrains Mono)
  - 顯示行號
  - Lint 有問題的行 → 行號背景色變為 lint 對應顏色 + tooltip 顯示訊息
    - error → --lint-error
    - warning → --lint-warning
- textarea：
  - 等寬字型
  - 與行號同步捲動
  - v-model 綁定 workspaceStore 的 rawText
  - tab 鍵輸入 2 spaces（而非切換焦點）
  - 基本語法著色不需要，但 lint error 的行需要有底色 highlight

## CSS
- 所有元件使用 scoped style
- 使用 variables.css 中的 CSS 變數
- 遵循 border-collie 的 panel / panel-header / panel-content 通用樣式

## 完成條件
- SplitPane 能正確渲染（左側 EditorPanel，右側先放一個 placeholder div）
- 在編輯區輸入文字 → console.log 能看到 parsedDiagram 更新
- Lint toggle 能開關 → filteredDiagnostics 對應變化
- 行號區域正確標示 lint 問題行
- 工作區可切換/新增/刪除
- 刷新頁面後資料保留（localStorage）
```

---

## Agent D: Diagram Renderer (SVG)

### 任務目標
實作右側檢視區的 SVG 架構圖渲染，包含佈局引擎、節點渲染、連線渲染。

### 前置條件
Agent A + B 已完成（types + parser 可用）。可與 Agent C 並行。

### Prompt

```
你要為 german-shepherd 專案實作右側的 SVG 架構圖渲染。

## 專案背景
German-Shepherd 把資訊系統網路架構以 DSL 語法描述，
parser 已產出 NetworkDiagram 資料模型（zone/node/connection），
你要把它渲染為 SVG 架構圖。

## 資料模型 (已定義在 src/types/index.ts)

主要結構:
- NetworkDiagram: { meta, zones, connections, nodes }
- DiagramZone: { name, children: (Zone|Node)[], depth }
- DiagramNode: { name, type, note?, tags?, zonePath }
- DiagramConnection: { from, to, direction, protocol, description? }
- ConnectionDirection: 'forward' | 'bidirectional' | 'none'
- DiagramMeta: { title, display: 'TD'|'LR', theme: 'simple'|'icon'|'image' }

## 要實作的檔案

### src/components/DiagramPanel.vue
- 頂部 toolbar（panel-header）：
  - 左側: 架構圖 title 顯示（來自 meta.title）
  - 右側 toolbar buttons:
    - display 切換: TD / LR toggle group
    - theme 切換: simple / icon toggle group
    - tags toggle: 顯示/隱藏標籤（btn-ghost toggle）
    - dark/light theme toggle（使用 border-collie 的 theme-toggle 風格）
- 內容（panel-content）: DiagramRenderer
- display/theme 切換直接修改 diagramStore 或 emit 更新 meta
- 注意: title/display/theme 來自 DSL header，toolbar 的切換應該是
  「覆蓋檢視用」的值，不要修改原始文字。
  建議在 diagramStore 加 displayOverride / themeOverride (可選 ref)，
  若 null 則用 meta 中的值。

### src/components/DiagramRenderer.vue
核心 SVG 渲染元件。

Props:
- diagram: NetworkDiagram
- theme: 'simple' | 'icon' | 'image'
- display: 'TD' | 'LR'
- showTags: boolean
- lintDiagnostics?: LintDiagnostic[] (用來 highlight 有問題的節點)

#### 佈局引擎

採用簡單的 **grid-based auto-layout**:

**LR (Left → Right) 模式：**
- 每個頂層 zone 是一個垂直 column
- zone 從左到右排列
- 每個 zone 內：
  - 子區塊也是獨立的 sub-column (嵌套)
  - 節點在 zone 內垂直排列
- zone 間距: 120px
- 節點間距: 60px
- zone padding: 20px

**TD (Top → Down) 模式：**
- 每個頂層 zone 是一個水平 row
- zone 從上到下排列
- 每個 zone 內：
  - 子區塊是獨立的 sub-row
  - 節點在 zone 內水平排列

#### 佈局計算步驟:
1. 遞迴計算每個 zone 的大小（基於內含 node 數量和子 zone）
2. 依 display 方向排列所有頂層 zone 的位置
3. 計算每個 node 的絕對座標 (x, y)
4. 將座標記錄為 Map<nodeName, {x, y, width, height}>
5. 連線路徑根據端點座標計算

#### Zone 渲染:
- 圓角矩形 (rx=8)
- 帶標題 bar（zone 名稱，背景色 --zone-color-N，循環使用）
- 深度越深背景越淺 (opacity 調整)
- 為 diff 預留 stroke 顏色 prop

#### 連線渲染:
- SVG path (bezier curve 或 manhattan routing)
- `forward` (->): 單向箭頭 (marker-end)
- `bidirectional` (<->): 雙向箭頭 (marker-start + marker-end)
- `none` (--): 無箭頭
- 連線上方標註: protocol (+ description)
- 連線顏色: --conn-default
- hover 時 highlight: --conn-highlight
- 定義 SVG `<defs>` 中的 arrowhead marker

### src/components/NodeRenderer.vue
SVG group (<g>) 元件，渲染單一節點。

Props:
- node: DiagramNode
- x: number, y: number
- theme: 'simple' | 'icon' | 'image'
- showTags: boolean
- isLintWarning: boolean (孤立節點)
- diffState?: DiffState

#### simple theme:
- 圓角矩形背景 (根據 NodeType category 決定顏色)
  - client → --node-client
  - network → --node-network
  - server → --node-server
- 名稱文字（主要，粗體）
- 類型文字（次要，小字，淺色）
- 特殊註記（底部小字，灰色斜體）
- 標籤 badges（小圓角矩形，accent 色）

#### icon theme:
- Font Awesome icon（根據 NODE_TYPE_ICONS 對照表）
  注意：SVG 中無法直接用 <i> tag，需要用 <text> + Font Awesome 的
  Unicode 碼位，或者用 <foreignObject> 包 HTML <i>
- 推薦方案：用 <foreignObject> 嵌入 <i class="fa-solid fa-xxx">
- 名稱文字在 icon 下方
- 其餘同 simple

#### image theme:
- 先用與 icon theme 相同的渲染（之後擴展自訂圖示）
- 預留 prop 接收自訂圖片 URL

#### 節點尺寸:
- simple: 寬 140px, 高度依內容自適應 (最小 60px)
- icon: 寬 100px, 高度 90px
- 所有節點的 hover 效果: 微微放大 + shadow

#### Lint highlight:
- isLintWarning=true → 紅色虛線邊框 + 小 warning icon

### src/components/ConnectionRenderer.vue
SVG group 元件，渲染單一連線。

Props:
- fromPos: {x, y, width, height}
- toPos: {x, y, width, height}
- connection: DiagramConnection
- diffState?: DiffState

路徑計算:
- 從 from 節點邊緣出發，到 to 節點邊緣結束
- 使用 bezier curve 或正交路徑
- 避免穿越 zone 矩形（簡化版：先不處理，用曲線繞過即可）

## SVG 整體結構

```svg
<svg viewBox="0 0 {totalWidth} {totalHeight}">
  <defs>
    <!-- arrowhead markers -->
  </defs>
  
  <!-- Zones (背景矩形) -->
  <g class="zones">
    <ZoneRenderer v-for="zone" />
  </g>
  
  <!-- Connections (在節點下方) -->
  <g class="connections">
    <ConnectionRenderer v-for="conn" />
  </g>
  
  <!-- Nodes (最上層) -->
  <g class="nodes">
    <NodeRenderer v-for="node" />
  </g>
</svg>
```

- SVG 需要支援 pan (拖曳平移) 和 zoom (滾輪縮放)
- 使用 viewBox 調整，搭配 @vueuse/core 的 useMouse 等

## CSS
- 使用 scoped style
- 引用 variables.css 的 CSS 變數
- SVG 內的文字用 CSS font-family: var(--font-family)
- Dark/light theme 自動適配（因為用 CSS 變數）

## 完成條件
- 給定一個 NetworkDiagram mock 資料 → SVG 正確渲染所有 zone、node、connection
- LR 和 TD 佈局正確
- simple 和 icon theme 正確切換
- 標籤顯示/隱藏正確
- 連線箭頭方向正確（3 種方向）
- SVG 可 pan/zoom
- hover 互動效果正常
```

---

## Agent E: Integration + Polish

### 任務目標
整合所有模組，完成 App.vue，驗證完整功能流程，修復問題，打磨 UI。

### 前置條件
Agent A + B + C + D 全部完成。

### Prompt

```
你要將 german-shepherd 專案的所有模組整合起來，完成最終的應用程式。

## 專案背景
German-Shepherd 是一個網路架構圖的 "Diagram as Code" 編輯器。
各模組已由不同 agent 完成：
- types (src/types/index.ts)
- parser + linter (src/parser/)
- stores (src/stores/)
- Editor UI (src/components/SplitPane, EditorPanel, TextEditor, WorkspaceDropdown)
- Diagram UI (src/components/DiagramPanel, DiagramRenderer, NodeRenderer, ConnectionRenderer)

## 你要做的事

### 1. 完成 src/App.vue

```vue
<template>
  <div id="app" class="app-container">
    <SplitPane :initial-ratio="0.35" :min-left="320" :min-right="400">
      <template #left>
        <EditorPanel />
      </template>
      <template #right>
        <DiagramPanel />
      </template>
    </SplitPane>
  </div>
</template>
```

- onMounted: 初始化 workspaceStore
- Dark mode toggle 整合
  - 預設 dark mode
  - localStorage 記住偏好

### 2. 資料流整合驗證

確認以下資料流正確運作:
```
textarea (EditorPanel)
  → workspaceStore.updateCurrentRawText()
  → diagramStore.parsedDiagram (computed)
  → DiagramRenderer props
  → SVG 即時更新
```

以及:
```
diagramStore.diagnostics
  → TextEditor lint highlight (行號標記)
  → DiagramRenderer node highlight (紅色邊框)
```

### 3. 修復已知的整合問題

常見問題清單（請逐一檢查並修復）：
- [ ] SplitPane 拖曳時 SVG 不跟著 resize → 確認 SVG 用 width="100%"
- [ ] textarea 與行號不同步捲動 → 確認 scrollTop 雙向綁定
- [ ] DiagramPanel toolbar 的 display/theme 切換未生效 → 確認 override 邏輯
- [ ] Font Awesome icon 未顯示 → 確認 CDN 載入 + foreignObject 正確
- [ ] Tags toggle 未影響 DiagramRenderer → 確認 prop 傳遞
- [ ] 工作區切換後 diagram 未更新 → 確認 watch 是否觸發
- [ ] 空輸入時 DiagramRenderer 報錯 → 確認空狀態處理
- [ ] localStorage 資料結構變更後舊資料無法載入 → 確認 migration 或 fallback

### 4. UI 打磨

- [ ] 頁面第一次載入要有預設範例資料（而非空白）
- [ ] 所有 tooltip 有中文說明
- [ ] 所有 icon button 有 title 屬性
- [ ] SplitPane toggle button 標示正確
- [ ] 空 diagram 時顯示引導文字（如："請在左側編輯區輸入架構圖語法..."）
- [ ] 確認 dark / light 主題在所有元件中切換正確
- [ ] 確認 scrollbar 樣式正確
- [ ] 增加簡單的 fade-in 動畫（app 載入時）

### 5. 最終驗證

用 browser 工具執行以下測試流程：

1. 頁面載入 → 顯示預設範例架構圖 ✓
2. 編輯文字 → 右側即時更新 ✓
3. 輸入非法類型 → lint error 顯示在行號 + 節點紅框 ✓
4. 刪除某節點的連線 → lint warning 標記孤立節點 ✓
5. 切換 Lint 開關 → highlight 消失/出現 ✓
6. 切換 theme: simple → icon → 節點圖示變化 ✓
7. 切換 display: LR → TD → 佈局方向切換 ✓
8. 切換 tags: on → off → 標籤消失/出現 ✓
9. SplitPane: 拖曳分割線 → 寬度調整 ✓
10. SplitPane: toggle 收合 → 滿版檢視 ✓
11. 工作區: 新增 → 切換 → 切回 → 資料各自獨立 ✓
12. 工作區: 刪除工作區 → 確認對話框 → 正確刪除 ✓
13. 重新整理頁面 → 資料仍在 ✓
14. Dark/Light 主題切換 → 所有元件正確響應 ✓

## 完成條件
- 以上 14 項測試全部通過
- `npm run dev` 啟動正常
- `npm run build` 建置無錯誤
- 所有 parser/linter 測試通過 (`npx vitest run`)
```

---

## 附錄: 檔案結構總覽

```
german-shepherd/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── assets/
│   │   ├── variables.css          # 從 border-collie 複製
│   │   └── main.css               # 通用樣式 + 專案特有變數
│   ├── types/
│   │   └── index.ts               # 所有型別定義
│   ├── parser/
│   │   ├── index.ts               # parseNetworkDiagram 入口
│   │   ├── metaParser.ts          # Header 解析
│   │   ├── diagramParser.ts       # Body 解析 (zone/node/connection)
│   │   ├── linter.ts              # Lint 規則
│   │   └── __tests__/
│   │       ├── diagramParser.test.ts
│   │       └── linter.test.ts
│   ├── stores/
│   │   ├── workspaceStore.ts      # 工作區管理 + localStorage
│   │   └── diagramStore.ts        # 即時解析 + lint 狀態
│   └── components/
│       ├── SplitPane.vue          # 左右分割面板
│       ├── ConfirmDialog.vue      # 確認對話框
│       ├── WorkspaceDropdown.vue  # 工作區切換選單
│       ├── EditorPanel.vue        # 編輯區面板
│       ├── TextEditor.vue         # 文字編輯器 + 行號 + lint
│       ├── DiagramPanel.vue       # 檢視區面板
│       ├── DiagramRenderer.vue    # SVG 架構圖渲染
│       ├── NodeRenderer.vue       # 單一節點 SVG
│       └── ConnectionRenderer.vue # 單一連線 SVG
└── docs/
    └── history/
        └── 2026-04-12-init/
            ├── spec-discussion.md
            ├── implementation_plan.md
            ├── task.md
            └── handoff-prompts.md  # (本文件)
```
