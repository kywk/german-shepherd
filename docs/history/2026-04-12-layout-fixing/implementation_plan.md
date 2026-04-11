# Layout Fixing - Implementation Plan

## 問題描述

目前 `useLayout.ts` 的佈局邏輯有以下問題：

1. **LR 模式**：頂層區段是上下排列（應為左右排列）
2. **TD 模式**：頂層區段是左右排列（應為上下排列）
3. **子區段與節點混排**：目前先排子區段再排節點，應視為同級依序排列
4. **節點無多欄/多列**：節點過多時全部擠在一欄/一列
5. **子區段排版方向未交替**：子區段應與父區段方向相反（LR→TD→LR）

## 設計決策

### 排版規則

| 項目 | LR 模式 | TD 模式 |
|------|---------|---------|
| 頂層區段排列 | 左→右 | 上→下 |
| 區段內 children 排列 | 上→下（主軸垂直） | 左→右（主軸水平） |
| 子區段內部方向 | 交替：TD | 交替：LR |
| 節點主軸 | 上→下 | 左→右 |
| 節點過多時 | 分多欄（左右展開） | 分多列（上下展開） |

### 多欄/多列自動計算

- 最多 3 欄/列
- 計算邏輯：`cols = Math.min(3, Math.ceil(nodeCount / 4))`
  - 1~4 個節點 → 1 欄
  - 5~8 個節點 → 2 欄
  - 9+ 個節點 → 3 欄
- 節點均分到各欄，餘數分配到前面的欄

### 子區段方向交替

遞迴時傳入 `direction` 參數：
- 頂層 `layoutZone(zone, direction='LR')` 
- 子區段自動用相反方向 `layoutZone(subZone, direction='TD')`
- 孫區段再交替回 `layoutZone(grandChild, direction='LR')`

### Children 混排

子區段和直接節點視為同級，按原始順序排列。
節點群組（連續的節點）作為一個 block 參與排列。

## 影響範圍

僅修改 `src/composables/useLayout.ts`，不影響其他檔案。

---

## Tasks

### Task 1: 重構 layoutZone 為統一函式

將 `layoutZoneLR` / `layoutZoneTD` 合併為單一 `layoutZone(zone, direction, ...)` 函式。
`direction` 決定 children 的排列方向（主軸）。

### Task 2: 實作 children 混排邏輯

遍歷 `zone.children`，按原始順序處理：
- 遇到子區段 → 遞迴 `layoutZone(child, oppositeDirection)`
- 遇到連續節點 → 收集為一組，計算多欄/多列佈局後作為一個 block

### Task 3: 實作節點多欄/多列自動計算

```
cols = min(3, ceil(count / 4))
```

LR 模式（direction='LR'）下節點 block：
- 節點主軸上→下，多欄時左→右展開
- block 寬 = cols × (NW + gap)
- block 高 = rows × (NH + gap)

TD 模式（direction='TD'）下節點 block：
- 節點主軸左→右，多列時上→下展開
- block 寬 = cols × (NW + gap)
- block 高 = rows × (NH + gap)

### Task 4: 修正頂層區段排列方向

- `display='LR'` → 頂層區段左→右排列
- `display='TD'` → 頂層區段上→下排列

### Task 5: 驗證

- `npm run build` 無錯誤
- `npx vitest run` 20/20 通過
- git commit
