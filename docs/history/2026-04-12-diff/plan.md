# 架構圖 Diff 功能 — Implementation Plan

## 需求摘要

- 編輯區按下 Diff 按鈕後，分成上下兩個編輯區（原始 / 修改後）
- 檢視區將兩份架構圖的節點合併為一張圖，以顏色標示 diff 狀態
- Diff 標示：紅色（刪除）、綠色（新增）、黃色（修改）、預設色（相同）
- 修改判定：同名節點的 `type`（icon）或 `zonePath` 不同即為修改，tags 不算
- 合併圖佈局：zone 取聯集
- 連線不標示 diff
- Diff 模式下按鈕變為 Exit（退出）和 Merge（合併後退出）
- Merge 衝突時以下方版本為準

## 影響範圍

| 檔案 | 變更類型 |
|------|---------|
| `src/stores/diagramStore.ts` | 修改：新增 diff 狀態管理 |
| `src/components/EditorPanel.vue` | 修改：Diff/Exit/Merge 按鈕、上下分割 |
| `src/components/DiagramPanel.vue` | 修改：diff 模式下傳入合併圖 |
| `src/composables/useDiff.ts` | 新增：diff 計算邏輯（比對 + 合併） |
| `src/components/NodeRenderer.vue` | 修改：依 diffState 渲染不同顏色 |
| `src/assets/main.css` | 修改：新增 diff 相關 CSS 變數 |

## Tasks

### Task 1: Diff 計算邏輯 — `src/composables/useDiff.ts`

新增 composable，輸入兩份 `NetworkDiagram`，輸出：

```ts
interface DiffResult {
  mergedDiagram: NetworkDiagram    // zone 聯集 + 所有節點 + 所有連線
  nodeDiffMap: Map<string, DiffState>  // nodeName → added | removed | modified | unchanged
}
```

比對邏輯：
- 以 `node.name` 為 key 比對兩份圖的節點
- 只在上方 → `removed`
- 只在下方 → `added`
- 兩邊都有但 `type` 或 `zonePath` 不同 → `modified`
- 其餘 → `unchanged`

合併邏輯（mergedDiagram）：
- zones：遞迴合併兩邊的 zone 樹，取聯集
- nodes：聯集，同名節點取下方版本
- connections：聯集（去重）
- meta：取下方版本

Merge 輸出（給 Merge 按鈕用）：
```ts
function mergeDiagramText(upperText: string, lowerText: string): string
```
- 解析兩份文字，合併後重新序列化為 DSL 文字
- 同名節點以下方為準
- zone 取聯集
- connections 取聯集

### Task 2: Store 擴充 — `src/stores/diagramStore.ts`

新增狀態：
- `diffMode: ref(false)` — 是否處於 diff 模式
- `diffUpperText: ref('')` — 上方編輯區文字
- `diffLowerText: ref('')` — 下方編輯區文字
- `parsedUpper: computed` — 上方解析結果
- `parsedLower: computed` — 下方解析結果
- `diffResult: computed` — 呼叫 useDiff 計算

Actions：
- `enterDiff()` — 進入 diff 模式，將當前文字複製到上下兩區
- `exitDiff()` — 退出 diff 模式，恢復原始文字
- `mergeDiff()` — 合併後退出，將合併結果寫回主編輯區

### Task 3: EditorPanel 改造 — `src/components/EditorPanel.vue`

- 新增 Diff 按鈕（在 header-right，Lint 旁邊）
- Diff 模式下：
  - 隱藏 Diff 按鈕，顯示 Exit + Merge 按鈕
  - panel-content 分成上下兩區，各放一個 TextEditor
  - 上方標示「Original」、下方標示「Modified」
- 兩個 TextEditor 各自綁定 `diffUpperText` / `diffLowerText`

### Task 4: DiagramPanel 改造 — `src/components/DiagramPanel.vue`

- 非 diff 模式：行為不變
- Diff 模式下：
  - 使用 `diffResult.mergedDiagram` 作為 diagram 來源
  - 將 `diffResult.nodeDiffMap` 傳給 DiagramRenderer

### Task 5: DiagramRenderer 傳遞 diffState — `src/components/DiagramRenderer.vue`

- 新增 optional prop `nodeDiffMap: Map<string, DiffState>`
- 將每個節點的 diffState 傳給 NodeRenderer

### Task 6: NodeRenderer diff 樣式 — `src/components/NodeRenderer.vue`

- 已有 `diffState` prop（目前未使用）
- 依 diffState 改變節點外觀：
  - `added`：綠色邊框 + 綠色半透明背景
  - `removed`：紅色邊框 + 紅色半透明背景 + 刪除線
  - `modified`：黃色邊框 + 黃色半透明背景
  - `unchanged`：維持原樣

### Task 7: CSS 變數 — `src/assets/main.css`

新增 diff 顏色變數：
```css
--diff-added: #22c55e;
--diff-removed: #ef4444;
--diff-modified: #eab308;
```

## 執行順序

Task 7 → Task 1 → Task 2 → Task 6 → Task 5 → Task 3 → Task 4
