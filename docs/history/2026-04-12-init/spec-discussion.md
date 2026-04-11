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
