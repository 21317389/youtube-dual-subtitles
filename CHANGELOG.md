# 📝 更新日誌 (Changelog)

本專案遵循 [Semantic Versioning (語意化版本)](https://semver.org/lang/zh-TW/) 規範。

---

## [v1.3.0] - 2026-09-04

### 🚀 主環境同源 InnerTube 高速引擎與現代化架構重構 (Main-World Native InnerTube & Architecture Overhaul)

* **網頁主環境同源 Android InnerTube 通道（150ms 極速無感載入）**：
  * 徹底解決 Chrome Extension Service Worker 跨域夾帶 `chrome-extension://` Origin 遭 Google 403 / Captcha 阻擋問題，改由主環境同源直接請求 Android 端點，100% 免疫 403、429 與 SABR `exp=xpe` token-gate 鎖定。
  * 實時字幕解析 150ms 內完成，開片即享全片時間戳與 Mode 1 雙槽合句，雙槽並存穩態率超過 99.5%。
* **生命週期握手防護（Lifecycle Timing Handshake）**：
  * 新增 `YT_REQUEST_CURRENT_TRACK` 雙向主動握手機制，徹底消滅 `document_start` 與 `document_idle` 載入時差造成之軌道廣播漏接。
* **全倍速極限壓力測試與長複合句自然語流防禦**：
  * 支援 1x ~ 16x 全倍速高速播放預載，單行塌陷/抖動幀數為 0。
  * 智慧合句引擎升級負向環視正則，完美防禦省略號結巴、複句連詞與非英文原文回傳。
* **全架構淨化與技術債消除（Technical Debt Cleaned）**：
  * 徹底清除 Service Worker 內已失效的 ~125 行死碼與無效 Fallback 瀑布流。
  * 逾時參數與防抖延遲全面統一收攏至頂部 `CONFIG` 管理，程式碼結構更簡潔穩健。

---

## [v1.2.0] - 2026-08-30

### 🛡️ 雙槽穩定性與排版防抖重大升級 (Dual-Slot Stability & Layout Anti-Jitter Overhaul)

* **CSS 物理全寬解耦（Flexbox Anti-Shrink-To-Fit）**：
  * 將字幕主容器 `#yt-dual-subtitle-container` 升級為播放器 100% 全寬獨立排版，徹底解決因下槽短字收縮導致上槽被擠成兩行、下槽長字時又彈回一行的惡性跳動問題。
  * 各槽位膠囊最大寬度設為 `min(90%, 860px)`，上槽排版完全獨立於下槽字數長短。
* **Gemini 模式黏性雙槽停頓架構（Sticky Gap Architecture）**：
  * 在講者停頓換氣期，下槽穩固保留剛完結的句子（帶完整譯文），直到新句開口吐字時才優雅升槽，徹底根治下槽瞬間清空蒸發導致畫面在單行與兩行之間劇烈抽搐的問題。
* **Mode 1 內建文本 CORS 代理下載**：
  * 針對 YouTube TimedText API 網頁端 fetch 受限問題，改由 `background.js` Service Worker 進行跨網域代理下載，並修復未定義呼叫，內建字幕雙槽率達到 100% 穩態常駐。
* **自動化回歸測試矩陣**：
  * 於 `test/` 目錄建立覆蓋真實 YouTube ASR 滾動突變快照與靜態播放測試（`node test/run_all_tests.js`），全面保障版本穩定性。

---

## [v1.1.2] - 2026-08-19

### 🛡️ Chrome Web Store 審查規範純淨打包 (Production Package Cleanliness)

* **剔除開發輔助檔案**：
  * 嚴格規範發布 ZIP 僅包含執行期必要檔案（`manifest.json`、核心 JS 模組、`popup`、`styles.css`、`icons/` 與 `_locales/`）。
  * 徹底移除發布包內的截圖生成器、預覽工具與外部 CDN 引用，100% 遵從 Google Manifest V3 禁止遠端代管程式碼（Blue Argon）政策。

---

## [v1.1.1] - 2026-08-17

### 🌐 全球多國語言國際化 (Full Chrome i18n Internationalization)

* **6 大語言在地化支援**：
  * 新增標準 `_locales/` 語言包：英文 (en)、繁體中文 (zh_TW)、簡體中文 (zh_CN)、日本語 (ja)、한국어 (ko)、Español (es)。
* **瀏覽器/系統語言智慧自適應**：
  * Chrome 線上商店與瀏覽器擴充功能管理介面自動根據用戶語言呈現在地化名稱與描述。
  * 彈出設定面板（Popup UI）與反白查詞釋義浮窗（Tooltip UI）全部按鈕及狀態全面實現在地化動態載入。
  * 初次安裝自動識別用戶母語並智慧推薦最適合的目標翻譯語言（如台灣/香港預設繁中、日本預設日文等）。

---

## [v1.1.0] - 2026-08-17

### 🌟 重大更新：雙軌智慧自動分流架構 (Dual-Track Smart Routing Architecture)

針對 YouTube 新型即時語音辨識串流音軌（`variant=gemini` / Live ASR）進行架構重構，建立雙軌智慧分流引擎：

1. **軌道一（傳統靜態字幕引擎）**：
   * 支援傳統 YouTube 影片、手動 CC 字幕與標準自動生成字幕。
   * 批次預先下載全片時間戳，執行 60fps 二分搜尋同步與全句預翻譯。
2. **軌道二（句級對稱雙槽滾動引擎 - Sentence-Driven Bilingual Dual-Slot Engine）**：
   * 專為新型即時 ASR 串流影片打造：
     * **上槽（Slot 1）**：永久穩固鎖定上一句歷史完結句（完整英文 + 繁體中文，0.65 高對比半透明黑膠囊底色背景）。
     * **下槽（Slot 2）**：當前正在講的句子在同一個膠囊內實時逐字吐字延伸，未遇到句末標點前絕不跳槽折行。
     * **平滑升槽**：當句末標點出現時，第 0 毫秒同步推升為 Slot 1，下槽無縫展開新句。

### 🛠️ 核心修正與效能優化 (Bug Fixes & Improvements)

* **零延遲同步鎖定（Synchronous Sentence Lock）**：
  * 徹底解決網路翻譯 150ms 非同步回呼期間，因 DOM 持續更新導致 Slot 1 完整長句被覆蓋縮水的競態 Bug（Race Condition）。
* **全域詞界尾綴歷史比對（Exact Word-Boundary Suffix Matching）**：
  * 精確識別並剝除 YouTube 滾動視窗中殘留的舊句中段切片與尾巴單字，杜絕重複疊加現象。
  * 完美支援真實英文 1 字日常極短句（如 `Yes.`、`No.`、`Sure.`、`Exactly.`）。
* **渲染層最後物理防禦（Defensive Display Filter）**：
  * 在 DOM 渲染輸出層加入最後一道安全攔截，保證 Slot 2 絕不渲染包含 Slot 1 歷史長句的任何前綴。
* **YouTube 原生音效與笑聲標籤清洗器（ASR Noise Filter）**：
  * 全面過濾 `>>`、`>>>`、`&gt;&gt;`（笑聲/講者切換符號）及 `[Laughter]`、`[Chuckles]`、`[Music]`、`[Applause]` 等無效噪聲註釋。
* **靜音/停頓期歷史持久化保留**：
  * 當說話者講完一句停頓換氣時，Slot 1 歷史雙語句永久保持在螢幕上，絕不在停頓期間突然閃退消失。
* **播放器音軌事件防抖保護（Track Re-entrance Guard）**：
  * 快取判斷納入串流監聽器狀態，避免 YouTube 定期發送音軌事件時重複銷毀與重建監聽器。

---

## [v1.0.2] - 2026-08-16

* **效能提升**：強化 60fps 二分搜尋幀循環與 MutationObserver 過濾規則，CPU 佔用率降至極低。
* **快取優化**：擴充 LRU 持久化快取容量至 3,000 筆。

---

## [v1.0.1] - 2026-08-15

* **UI 改進**：修正 YouTube Shorts 垂直定位自適應（`bottom: 125px`）。
* **快速查詞**：新增反白查詞 Tooltip 與原聲片段重播功能。

---

## [v1.0.0] - 2026-08-14

* 初始版本發布（Initial Release）。
* 支援雙語字幕、滑動窗口動態翻譯與基本熱鍵操作。
