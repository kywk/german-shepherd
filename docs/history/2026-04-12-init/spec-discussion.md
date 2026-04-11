# German-Shepherd

## 專案目的

本專案要開發兼顧方便 __編輯__ 與 __視覺呈現__ 的 資訊系統網路架構 管理頁面.
區分 _編輯區塊_ 和 _檢視區塊_. __資料即時連動__.

在編輯區塊用類似 mermaid 語法(規格如後)編輯與描述網路架構圖, 檢視區塊顯示

## 技術架構

- 純前端 SPA, 優先選用 Vue.js
    - CSS、網站風格可參考 ~/workspace/sheltie/border-collie
- 可以直接 host 在 github pages 或私人靜態網頁服務器, 不需要後端資料庫
- 編輯區資料可以存在 browser localstorage, 下次打開頁面時自動帶出

## 需求詳情

資訊系統網路架構圖語法規格如下

```markdown
title: AP 2.0
display: TD/LR (Top -> Down/Left -> Right)
theme: simple
---
網路區段 A:
  - 節點名稱 N1, 節點類型 T1 (, 特殊註記), (#標籤1 #標籤2)
  - 節點名稱 N2, 節點類型 T2 (, 特殊註記)

網路區段 B:
    - 子區塊B1: (只要有: 即為子區塊)
      - 節點名稱 N3, 節點類型 T3
      - 節點名稱 N4, 節點類型 T4
    - 子區塊B2:
      - 節點名稱 N5, 節點類型 T5
      - 節點名稱 N6, 節點類型 T6
  - 節點名稱 N7, 節點類型 T7
  - 節點名稱 N8, 節點類型 T8

節點A -> 節點B: 連線方式(, 連線說明)
節點B -> 節點C: 連線方式(, 連線說明)
...
```

Example:
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

### 節點類型

共支援節點類型如下

客戶端:
- App
- Web 

網路設備:
- Firewall
- WAF
- F5
- Storage

服務器:
- AP Server
- Web Server
- SAP
- Database

### 通訊方式

- HTTP
- SOAP
- WebSocket
- gRPC
- RFC
- FTP
- Socket
- Others

### 其他需求說明

- 節點的特殊註記和標籤, 需在視覺化呈現時顯示
- 沒有指定 theme 時, 預設為 simple
- 編輯區需提供 Lint 功能, 若某節點沒有通訊方式連接, 需 highlight.
    - Lint 功能可開關
- 未來將提供 diff 功能, 請先預留 UI 元件的彈性

## 視覺化呈現需求

- 可參考 mermaid / plantuml / c4 ... 等 diagram as code 的設計, 但本專案需求簡化許多, 請勿複雜化.
- 不同網路區塊和節點需清楚呈現, 排版簡單俐落
- 請依 TD (Top -> Down) / LR (Left -> Right) 自動排版
- 可選 theme, 更改節點圖示
    - simple: 節點用簡單方框顯示
    - icon: 幫我從 font awesome 挑選合適 icon
    - image: 幫我設計 fashion 節點圖示
    - ... 保留擴充
- 日後預計新增 diff 功能, 請預留顯示 diff 節點（highlight 不同顏色）的設計
- 特殊註記 視覺上小字標註呈現

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
