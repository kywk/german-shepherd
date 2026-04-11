---

Edited spec-discussion.md
Edited spec-discussion.md
Edited spec-discussion.md
Edited spec-discussion.md

Let me re-read the updated file to confirm all changes and identify remaining open questions.

Viewed spec-discussion.md:1-135

好的，我已確認你的修正。以下整理出 **實作前仍需釐清的事項**，依重要程度排列：

------

## 🔴 必須釐清（影響 Parser / 核心設計）

### 1. 規格模板中仍有 4 處「類性」→「類型」錯字
- L28, L33, L36, L38 — 這些在語法模板定義中，若進入正式 spec 文件需修正。

### 2. 語法模板與範例的節點格式不一致
規格模板（L27）：
```
節點名稱, 節點類型 (, 特殊註記), (#標籤1 #標籤2)
```
→ 特殊註記和標籤用 **額外的逗號** 分隔，且標籤被 **括號包裹**

範例（L64, L67, L69）：
```
PQM, AP Server, #核心系統
CRM, SAP, #核心系統 #將汰換
```
→ 標籤直接以逗號分隔，**無括號**，且特殊註記未出現

**請確認最終格式**，我理解應該是：
```
節點名稱, 節點類型(, 特殊註記)(, #標籤1 #標籤2)
```
即：名稱和類型必填，特殊註記和標籤可選，都用逗號分隔，標籤以 `#` 前綴辨識。**不需要括號**。是否正確？

### 3. 子區塊的巢狀深度限制
規格定義了子區塊（名稱後加 `:`），但 **子區塊是否可以再嵌套子區塊**？例如：
```
DMZ2:
  MASA:
    SubGroup:
      - Node, Type
```
→ 是否支持三層以上？如果支持，是否有最大深度限制？

### 4. `display` 預設值
已確認 `theme` 預設為 `simple`，但 `display` 未指定時預設 `TD` 還是 `LR`？

### 5. 連線方向是否為單向
`A -> B` 是否永遠表示單向？是否需要支持 `A <-> B`（雙向）或 `A -- B`（無方向）？

---

## 🟡 建議釐清（影響 UX 設計）

### 6. 標籤的視覺呈現與互動
標籤（如 `#核心系統`、`#將汰換`）在檢視區如何呈現？
- 方案 A：節點上顯示小標籤 badge
- 方案 B：僅作為 metadata，提供篩選/過濾功能
- 方案 C：兩者都要

### 7. 編輯區與檢視區的版面配置
「區分編輯區塊和檢視區塊」—— 預設左右並排？上下排？是否可切換？
- 方案 A：左編輯 / 右檢視（類似 Markdown 編輯器）
- 方案 B：可切換 左右 / 上下 / 全螢幕

### 8. LocalStorage 資料管理
- 是否支持管理多份架構圖（多個 document）？
- 是否需要匯入/匯出功能（如 `.yaml` 或 `.json` 檔案下載/上傳）？
- 這對 UI 設計影響較大（是否需要文件列表頁面）

### 9. Lint 的 highlight 方式
「若某節點沒有通訊方式連接, 需 highlight」——
- 是在編輯區 highlight（如紅色底線）？
- 還是在檢視區的節點上 highlight？
- 或是兩邊都要？

---

## 🟢 小修正備註

- L118: `hightlight` → `highlight`
- L129: `fone awesome` → `Font Awesome`
- L132: `hightlight` → `highlight`

---

請針對以上問題給我你的決定，我會據此產出正式的實作計畫。

------

1. 已修正
2. 括號表示可選, 你的理解正確.
   名稱和類型必填，特殊註記和標籤可選，都用逗號分隔，標籤以 `#` 前綴辨識。**不需要括號**。
3. 最多三層
4. 目前多為寬螢幕, 預設 LR
5. 請支援單向, 雙向, 無方向
6. 方案 C, 但檢視區可提供 toogle 關閉小標籤
7. 方案 A, 但請參考 border-collie 的 ui compoment, 可以調整寬度和 toggle 滿版
8. 請參考 border-collie 的工作區, Markdown 本身就可以複製貼上, 資料也很清楚, 不需要轉換成 yaml/json
9. 兩者都要

請問是否還有待釐清事項, 若無, 請產生 implementation plan / tasks
