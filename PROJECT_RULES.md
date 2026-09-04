# YouTube Dual Subtitles - 工程架構鐵則 (Architecture Invariants)

本文件記載本專案經過真實世界血淚排查後建立的「核心防禦鐵則」。任何維護本專案的工程師或 AI Agent 必須嚴格遵守：

---

### 鐵則 1：跨環境生命週期握手協議（Handshake Protocol）
- **背景**：`inject.js` 運作於 `world: "MAIN", run_at: "document_start"`；`content.js` 運作於 `world: "ISOLATED", run_at: "document_idle"`。兩者載入相差數百毫秒至 2 秒。
- **鐵則**：
  1. 嚴禁依賴 `inject.js` 的單向一次性事件廣播。
  2. `content.js` 誕生時必須主動向主環境發起 `YT_REQUEST_CURRENT_TRACK` 索取。
  3. `inject.js` 收到請求時必須立即清空去重鎖，重新廣播最新軌道。
  4. 必須持續通過 `test/test_lifecycle_handshake.js` 回歸驗證。

---

### 鐵則 2：DOM 掛載嚴格邊界保護
- **背景**：先前 `getActivePlayer()` 曾因 fallback 至 `document.body`，導致字幕容器被渲染至千像素外的留言區底部，畫面完全黑洞。
- **鐵則**：
  1. 字幕容器與 Tooltip 只能掛載在 `#movie_player` 或 `.html5-video-player` 內部。
  2. 若播放器尚未就緒，嚴禁退化至 `document.body`，必須靜待播放器掛載。

---

### 鐵則 3：原生字幕絕對防禦安全網
- **背景**：先前的 CSS 樣式表寫了無條件 `opacity: 0 !important`，導致雙語字幕在載入中或 429 失敗時，連官方英文字幕也被黑洞吞噬。
- **鐵則**：
  1. 嚴禁在 CSS 中對 `.ytp-caption-window` 進行全域無條件透明化。
  2. 必須嚴格以 `#movie_player.yt-dual-sub-active` 作為前綴，僅在雙語字幕確認有文字渲染上屏時才遮蔽原生字幕。

---

### 鐵則 4：嚴禁「虛擬模擬」自欺欺人
- **背景**：自動化腳本若以 `page.evaluate()` 依序手動注入腳本並點擊按鈕，會完全掩蓋 `manifest.json` 排程帶來的時序競爭。
- **鐵則**：
  1. 任何宣稱「實機驗證通過」前，必須驗證真實 Chrome 的非同步排程與網路狀態。
  2. 遇到問題時，第一時間以真實控制台日誌（Console Logs）順序作為診斷依據，不妄下定論。

---

### 鐵則 5：嚴防網路連鎖風暴與 IP 429 熔斷機制 (Anti-Storm & 429 Cooldown Guard)
- **背景**：
  先前曾因 `inject.js` 的狀態變更事件（`onStateChange`、`onCaptionsTrackListChanged`、多重 `setTimeout` 輪詢）與 `content.js` 的 `YT_REQUEST_CURRENT_TRACK` 形成無防抖的正向反饋死循環，導致在 1 秒內連續向 YouTube `timedtext` 端點發送超過 15 次請求。這直接觸發了 Google 全域防爬蟲保護（`HTTP 429 Too Many Requests: ... automated queries`），導致整台電腦的 IP 被 Google 封鎖，連 YouTube 官方原生 CC 字幕也一併被拉黑癱瘓。
- **鐵則**：
  1. **嚴禁無防抖高頻事件廣播**：
     `inject.js` 中的 `notifyCurrentTrack` 必須具備去重鎖與防抖閥值，同一軌道在短時間內嚴禁重複廣播。
  2. **單一請求在線互斥鎖（Single In-Flight Lock）**：
     `content.js` 處理 `YT_CAPTION_TRACK_CHANGED` 時，必須以 `currentTrackKey` 嚴格鎖定。當同一部影片的字幕下載仍在進行中時，絕對不允許發起第二個重複請求。
  3. **嚴禁輪詢轟炸（No Redundant Polling Chains）**：
     嚴禁在 `content.js` 或 `inject.js` 中串聯 `setTimeout(..., 200)`、`setTimeout(..., 600)`、`setTimeout(..., 1200)` 連續索取軌道。握手索取只能在生命週期初期發起一次。
  4. **429 智能冷卻與即刻熔斷（Smart 429 Backoff）**：
     一旦檢測到任何字幕端點回傳 HTTP 429 或含有 `<title>Sorry...</title>`，系統必須立即啟動本地 60 秒冷卻期，禁止在冷卻期間繼續對該端點重試發送，直接安全降級至 Mode 2，嚴禁對 Google 伺服器進行自殺式重試轟炸！

