# 餵食零韻・萬聖節 Trick or Treat

在零韻的圖書館餐廳抽食材、擺上九宮格盤子，收手送餐給零韻鑑定——估價過線得 Treat，未達標吃 Trick，鳳梨落盤直接掀盤。結算會發一張可以存圖的「萬聖節料理鑑定證書」。

**玩：** https://dr1090a.github.io/rein-trick-or-treat/

## 檔案

- `data.js` — 所有材料、容器、組合技、結局、隨機事件、trick 與數值。改文字和平衡只動這個檔。
- `game.js` — 遊戲邏輯（狀態機），只讀 `data.js` 的規則代號。
- `style.css`、`index.html` — 畫面。
- `assets/rein/` — 零韻表情立繪。

## 直播用

- OBS 瀏覽器來源可加 `?obs=1` 讓背景透明，或在頁面按 `T` 切換。
- 快捷鍵：空白鍵抽一樣、`1`–`9` 放到第幾格、`Enter` 送餐。
