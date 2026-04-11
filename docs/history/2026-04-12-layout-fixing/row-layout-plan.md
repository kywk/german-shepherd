# Layout 連線感知對齊 - 方案分析

## 問題

LR 模式下，跨多個 zone 的連線（如 NS Agent Pro → Agency Service）需要 H→V→H 路徑。
垂直段必然穿越中間 zone（DMZ1）的節點，因為 DMZ1 的節點佔滿了整個 Y 帶。

走廊避障無法解決，因為問題在 layout 本身：中間 zone 的節點擋住了所有可能的走廊。

## 模擬計算（icon theme, LR）

```
Internet zone:
  AP 2.0:       Y ≈ 84,  center Y ≈ 129
  NS Agent Pro: Y ≈ 206, center Y ≈ 251

DMZ1 zone:
  FlashLight:   Y ≈ 84,  center Y ≈ 129
  AP IDP:       Y ≈ 206, center Y ≈ 251

DMZ2/MASA zone (TD 排列):
  Auth:           Y ≈ 120, center Y ≈ 165
  Agency Service: Y ≈ 120, center Y ≈ 165
  NAS:            Y ≈ 120, center Y ≈ 165
```

NS Agent Pro (Y≈251) → Agency Service (Y≈165):
- 垂直段 Y 跨度: 165~251
- DMZ1 的 AP IDP (Y=206~296) 完全在這個帶內
- 無論 midX 選在哪裡，都會穿越 AP IDP

## 解法：Row-based layout

LR 模式下，不再讓每個 zone 獨立決定節點 Y 位置。
改為全局分配 Y row，讓有連線關係的節點盡量在同一 row。

### 演算法

1. **分配 row**：
   - 分析所有連線，建立節點的連線圖
   - 用 BFS/DFS 從左到右遍歷，把有直接連線的節點分配到同一 row
   - 同一 zone 內的節點如果沒有跨 zone 連線，依序填入空 row

2. **計算 Y**：
   - 每個 row 有固定高度 (NH + ROW_GAP)
   - 節點的 Y = MARGIN + row * rowHeight
   - 所有 zone 共享同一 row grid

3. **好處**：
   - AP 2.0 和 FlashLight 在 row 0 → 直線連接
   - NS Agent Pro 和 AP IDP 在 row 1
   - Auth 和 Agency Service 可以在 row 0 或 row 1
   - 跨 zone 連線大多是水平直線，不需要垂直段

### 複雜度
- O(N + E) 其中 N=節點數, E=連線數
- 簡單的 greedy row assignment，不需要複雜的圖演算法
