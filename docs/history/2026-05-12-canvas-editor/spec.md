# 手動編輯畫布 — 規格與實作計畫

## 背景

右側檢視區目前為唯讀的自動 layout 渲染，自動 layout 常有不盡人意之處。
需改為可編輯畫布，支援拖拉節點、編輯連線，手動調整後的座標資訊以 YAML 格式存於 markdown 末尾的 code block。

---

## 需求摘要

### 模式切換
- 明確的「切換到手動模式」按鈕（避免誤觸）
- 「重置為自動 layout」按鈕（清除所有手動座標）
- 可重置單一節點回自動位置

### 畫布操作（手動模式）
| 操作 | 說明 |
|------|------|
| 節點拖拉 | 單選拖動，即時更新座標 |
| 新增節點 | 雙擊空白處，建立預設節點，zone 根據放置位置判斷，之後可編輯 |
| 連線提示 | hover 節點時顯示四邊 port 圓點，從 port 拖出建立連線 |
| 新增連線 | 從 port 拖到另一節點後彈出表單（protocol / direction / description） |
| 刪除連線 | 選取連線後按 Delete 鍵 |
| 連線彎折點 | 可拖拉調整 waypoints |

### 資料格式

手動座標存於 markdown **最末尾**的 fenced code block（無語言標記），靠位置辨識。
內容為 YAML：

```
nodes:
  AP 2.0:
    x: 100
    y: 200
  FlashLight:
    x: 300
    y: 150
connections:
  - from: AP 2.0
    to: FlashLight
    fromSide: right
    toSide: left
    waypoints:
      - x: 250
        y: 200
      - x: 250
        y: 150
```

- 節點尺寸不記錄，由 theme 決定
- 連線需記錄 fromSide / toSide / waypoints

### 雙向同步
- 畫布操作即時回寫 code block → 左側 markdown 同步更新
- 左側 markdown 編輯即時反映到畫布
  - 改名 → 自動更新 YAML key
  - 新增節點 → 給預設位置
  - 刪除節點 → 自動移除 YAML 條目

### Undo
- Ctrl+Z 共用一個 undo stack（畫布操作 + 文字編輯器）

### Zone
- Zone 框自動根據內含節點位置重新計算（不手動調整）

---

## 實作計畫

### Phase 1: 資料層基礎

**Task 1.1 — Layout code block parser / serializer**
- 新增 `src/parser/layoutParser.ts`
- 解析 markdown 末尾 code block → 結構化 layout data
- 序列化 layout data → code block 字串
- 處理 nodes（name → x, y）和 connections（from, to, fromSide, toSide, waypoints）

**Task 1.2 — 統一 Undo stack**
- 新增 `src/composables/useUndoStack.ts`
- 記錄 markdown 全文快照（或 diff patch）
- 支援 Ctrl+Z / Ctrl+Shift+Z
- 整合文字編輯器與畫布操作

**Task 1.3 — Canvas store**
- 新增 `src/stores/canvasStore.ts`
- 管理手動模式狀態（isManualMode）
- 管理選取狀態（selectedNode / selectedConnection）
- 提供 actions：moveNode, addNode, removeConnection, updateWaypoint 等
- 每次操作後呼叫 serializer 回寫 markdown

### Phase 2: 畫布互動 — 節點

**Task 2.1 — 手動模式切換 UI**
- DiagramPanel 新增「手動/自動」切換按鈕
- 進入手動模式時，若無 code block 則自動產生（快照當前自動 layout 座標）
- 「重置」按鈕清除 code block

**Task 2.2 — 節點拖拉**
- DiagramRenderer 手動模式下，節點可拖動
- 拖動結束更新 canvasStore → 回寫 markdown
- 單一節點右鍵可「重置位置」

**Task 2.3 — 新增節點**
- 雙擊空白處建立預設節點（name: "New Node", type: "AP Server"）
- 根據點擊位置判斷所屬 zone
- 同步寫入 markdown body（節點定義）+ code block（座標）
- 節點建立後進入編輯狀態（inline 或 popover 表單）

### Phase 3: 畫布互動 — 連線

**Task 3.1 — 連線 port 提示與拖拉建立**
- hover 節點時顯示四邊 port 圓點
- 從 port 拖出時顯示臨時連線
- 放到目標節點上 → 彈出表單（protocol / direction / description）
- 確認後寫入 markdown body（連線定義）+ code block（路由資訊）

**Task 3.2 — 連線選取與刪除**
- 點擊連線可選取（高亮顯示）
- 按 Delete 鍵刪除選取的連線
- 同步移除 markdown body 的連線定義 + code block 條目

**Task 3.3 — Waypoint 編輯**
- 選取連線後顯示 waypoint 控制點
- 可拖拉 waypoint 調整路由
- 可在線段中間雙擊新增 waypoint
- 更新 code block

### Phase 4: 雙向同步

**Task 4.1 — Markdown → Canvas 同步**
- 監聽 markdown 文字變化
- 偵測節點改名 → 更新 code block 中對應 key
- 偵測節點新增 → 計算預設位置寫入 code block
- 偵測節點刪除 → 移除 code block 條目
- 偵測連線變化 → 同步 code block

**Task 4.2 — Zone 自動計算**
- 手動模式下 zone 框根據內含節點座標自動計算 bounding box
- 加上 padding 和 header 高度

### Phase 5: 收尾

**Task 5.1 — 節點編輯表單**
- 選取節點後可編輯 name / type / note / tags
- 修改同步回 markdown body

**Task 5.2 — 測試**
- layoutParser 單元測試
- undo stack 單元測試
- 雙向同步整合測試

---

## 技術決策

- 不引入新的圖形庫（如 d3-drag），使用原生 SVG 事件 + Vue composable
- Undo stack 基於全文快照（markdown 文字不大，簡單可靠）
- Code block 解析使用簡單正則 + js-yaml（已有 yaml 相關依賴可用）或手寫輕量 yaml parser
