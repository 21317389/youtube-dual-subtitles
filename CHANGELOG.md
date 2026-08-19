# 📝 更新日誌 (Changelog)

本專案遵循 [Semantic Versioning (語意化版本)](https://semver.org/lang/zh-TW/) 規範。

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
