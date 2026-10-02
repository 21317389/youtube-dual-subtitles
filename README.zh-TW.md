# 🎬 YouTube Dual Subtitles & Quick Translate

<p align="center">
  <a href="./README.md">English</a> | <b>繁體中文</b>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/mjegnldlpifcepbeepojcbimgdbdilig"><img src="https://img.shields.io/badge/Chrome_Web_Store-免費一鍵安裝-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome Web Store" /></a>
  <img src="https://img.shields.io/badge/Manifest-V3-blue?style=for-the-badge&logo=google-chrome" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License" />
  <img src="https://img.shields.io/badge/Zero-Dependencies-orange?style=for-the-badge" alt="Zero Dependencies" />
</p>

<p align="center">
  👉 <b><a href="https://chromewebstore.google.com/detail/mjegnldlpifcepbeepojcbimgdbdilig">點此前往 Chrome 線上應用程式商店免費安裝 (Chrome / Edge / Brave 皆相容)</a></b>
</p>

一款專為語言學習者、影音內容創作者與跨國資訊汲取者打造的 **高純淨、零延遲、雙軌智慧分流 YouTube 雙語字幕與即時選詞翻譯 Chrome 擴充功能**。

如果你正在尋找 **免費、免註冊、免填 API Key** 的 **YouTube 雙語字幕擴充功能推薦**，或是覺得傳統翻譯外掛（如沉浸式翻譯、Language Reactor）在觀看 YouTube 自動產生字幕（ASR）時容易跳行閃爍、介面過於臃腫，本工具提供最輕量、專為 YouTube 觀影與外語聽力跟讀（Shadowing）量身打造的純淨替代方案。

---

## 📊 為什麼選擇本工具？（YouTube 雙語字幕擴充功能對比）

| 比較項目 | 本擴充功能 (YouTube Dual Subtitles) | 一般網頁翻譯外掛 (如沉浸式翻譯等) | 傳統重型學習外掛 (如 Language Reactor) |
| :--- | :--- | :--- | :--- |
| **定位與輕量度** | **專精 YouTube 觀影與跟讀，極致輕量零干擾** | 全網頁通用翻譯，腳本體積較龐大 | 功能繁雜，常改動 YouTube 播放器原生版面 |
| **自動字幕 (ASR) 防跳行** | **獨家「雙槽句級鎖定」引擎，上槽鎖定前句、下槽平穩延伸** | 常隨 YouTube 逐字滾動而頻繁重繪閃爍 | 部分支援，但無標點音軌易斷句破碎 |
| **母語/日常影片不干擾** | **智慧連動 YouTube 原生 `CC` 按鈕，未開 CC 絕不強彈字幕** | 常無差別自動注入或覆蓋原生字幕 | 常強制接管播放器字幕開關 |
| **反白查詞 + 原聲切片重播** | **內建反白字典 + 一鍵倒帶重播講者「該句真實原聲」** | 僅文字翻譯，無影片原聲切片重播 | 需開啟側邊欄或進階付費版 |
| **YouTube Shorts 支援** | **原生支援 Shorts 短影音垂直排版自適應** | 常遮擋 Shorts 標題或無法觸發 | 不完全支援 Shorts 短影音 |
| **費用與帳號門檻** | **100% 免費開源、免註冊帳號、免自備 API Key** | 進階模型需付費訂閱或自備 API Key | 進階詞庫與功能需付費訂閱 Pro |

---

## ✨ 核心特色 (Key Features)

* 🌟 **雙軌智慧自動分流（Dual-Track Smart Routing）**：
  * **軌道一（傳統靜態字幕）**：批次全句預翻譯、60fps 二分搜尋幀循環極速同步，隨點隨跳進度條零延遲。
  * **軌道二（Gemini ASR 即時串流）**：首創「句級對稱雙槽滾動引擎」——上槽永久鎖定上一句完結長句（英+中），下槽實時逐字吐字延伸，句末第 0ms 同步推升，0 競態、0 覆蓋縮水、0 粘連重複。
* 🎯 **尊重使用者習慣（與 YouTube 原生 CC 智慧連動）**：
  * 預設不強開字幕！僅在您主動開啟 YouTube 播放器右下角「CC 字幕」且插件總開關開啟時才渲染雙語字幕；關閉插件總開關時，立即無縫恢復 YouTube 原始 CC 字幕。
* ⚡ **60fps 動畫幀同步（Zero-Delay Sync）**：
  * 拋棄低頻的 `video.timeupdate`，採用 `requestAnimationFrame` 迴圈以 16.6ms 精度即時比對，徹底消除傳統擴充功能 250ms 的字幕落後延遲。
* 🧠 **智慧合句與段內標點拆解（Smart Sentence Merging）**：
  * 自動將 YouTube ASR 破碎短詞聚合成語意通順的完整句子。
  * 內建嚴格句號/標點斷句規則，**絕不發生多句沾黏與跨句溢出**。
* 🧹 **YouTube 原生音效與笑聲清洗（ASR Noise Filter）**：
  * 自動過濾 `>>`、`>>>`、`&gt;&gt;`（笑聲/講者切換標記）及 `[Laughter]`、`[Music]`、`[Applause]` 等無效註釋，保持畫面極致純淨。
* 🚀 **首句極速優先通道（Instant Fast Lane）**：
  * 影片開播或隨意拖曳進度條（Seek）時，第一時間在 **80ms ~ 120ms 內秒開翻譯**，杜絕「翻譯中...」的卡頓等待感。
* 🛡️ **2.5 秒超時熔斷與三端點輪替（Endpoint Rotation & Fallback）**：
  * 內建 3 組官方純淨 GTX 翻譯端點，遇 HTTP 429 或網路逾時自動在 2.5 秒內強制熔斷並無感切換備用端點。
* 💾 **3,000 筆持久化 LRU 快取（Persistent Storage Cache）**：
  * 同步儲存於 `chrome.storage.local`，即使 Service Worker 進入休眠重啟，看過的字幕永遠無需重複發送翻譯請求。
* 🔍 **反白即查詞 & 影片原聲重播（Selection Tooltip & Audio Snippet）**：
  * 滑鼠反白字幕單字即可查看繁體中文釋義。
  * 內建「🎬 聽原聲」可精準截取該單詞在影片中的原始語音切片重播，並支援「🗣️ 朗讀」。
  * 阻斷事件冒泡，杜絕與第三方翻譯擴充功能彈窗打架。
* 📱 **YouTube Shorts 短影音垂直自適應**：
  * 自動偵測 Shorts 播放器並調整垂直間距（`bottom: 125px`），完美避開標題與互動按鈕。
* 🎨 **動態 4 級字級與總開關**：
  * 支援「小型、標準、大型、特大」，字幕與選詞 Tooltip 視窗即時按比例連動縮放。

---

## 📖 使用說明 (User Guide)

### 1. 啟用雙語字幕
1. 打開任意 YouTube 影片或 YouTube Shorts。
2. 點擊 YouTube 播放器控制列右下角的 **「CC」字幕按鈕**（或按下鍵盤快速鍵 <kbd>C</kbd>）。
3. 擴充功能將會**自動識別影片類型**：
   * **傳統影片**：自動載入全片字幕並啟用批次高速翻譯。
   * **即時 ASR / Gemini 串流影片**：自動啟動「句級雙槽雙語滾動引擎」。
4. 若想暫時看回 YouTube 原始單語字幕，只需點擊右上角插件圖示關閉總開關，畫面即刻恢復原生 CC 字幕。

### 2. 閱讀雙槽字幕
* **上槽 (Slot 1)**：上一句已講完的**完整長句**（原文 + 目標語言譯文，搭配 0.65 半透明黑膠囊底色背景，層次分明）。
* **下槽 (Slot 2)**：講者**當前正在講的句子**（原文在同一個膠囊內實時逐字吐字延伸，遇到句末標點符號完結時平滑推升至上槽）。

### 3. 反白查詞與聽原聲發音
1. 用滑鼠直接在字幕上**反白選取任意生詞或片語**。
2. 畫面會立即彈出磨砂玻璃質感的釋義浮窗，顯示單字釋義。
3. 點擊 **「🎬 聽原聲」**：播放器會自動倒帶並精準截取影片中講者說出該單詞的原聲切片進行重播！
4. 點擊 **「🗣️ 朗讀」**：使用瀏覽器標準語音合成發音。

### 4. 設定面板操作
點擊瀏覽器右上角擴充功能圖示，可自訂：
* **啟用雙語字幕**：總開關（iOS 風格平滑切換，關閉時自動還原 YouTube 原生 CC）。
* **目標翻譯語言**：支援繁體中文 (zh-TW)、簡體中文 (zh-CN)、英文 (en)、日文 (ja)、韓文 (ko)、西班牙文 (es)、法文 (fr)、德文 (de)、越南文 (vi)、泰文 (th)。
* **字幕字級**：小型 (85%)、標準 (100%)、大型 (115%)、特大 (130%)，字幕與查詞浮窗即時按比例縮放。

---

## ⚡ 鍵盤快捷鍵 (Shortcuts Cheatsheet)

在播放 YouTube 影片時，可直接透過以下熱鍵實現極速跟讀（Shadowing）與聽力訓練：

| 快捷鍵 | 功能描述 |
| :---: | :--- |
| <kbd>R</kbd> | **重播當前句子影片原聲**（精準截取該句時間戳記播放，結束後自動暫停） |
| <kbd>A</kbd> | **跳至上一句字幕**（影片時間軸同步跳轉至上一句開頭） |
| <kbd>D</kbd> | **跳至下一句字幕**（影片時間軸同步跳轉至下一句開頭） |

*(註：當游標處於留言輸入框或搜尋列時，熱鍵會自動避讓，不影響正常打字。)*

---

## 📥 安裝指南 (Installation)

### 方式一：Chrome 線上應用程式商店一鍵安裝（推薦）
* 👉 **[前往 Chrome Web Store 免費安裝 YouTube 雙語字幕與即時翻譯](https://chromewebstore.google.com/detail/mjegnldlpifcepbeepojcbimgdbdilig)**（支援 Google Chrome、Microsoft Edge、Brave、Arc 等所有 Chromium 核心瀏覽器）。

### 方式二：透過開發者模式載入（本地開源版安裝）

1. 點擊本專案右上角 `Code` -> `Download ZIP` 並解壓縮（或使用 `git clone https://github.com/21317389/youtube-dual-subtitles.git`）。
2. 開啟 Chrome 瀏覽器，在網址列輸入 `chrome://extensions/`。
3. 開啟右上角的 **「開發者模式 (Developer mode)」**。
4. 點擊左上角的 **「載入未封裝項目 (Load unpacked)」**，選擇本專案資料夾即可完成安裝！

---

## ❓ 常見問題與選型指南 (FAQ)

### Q1：為什麼開啟插件後沒有看到雙語字幕？
為避免在您觀看母語或日常娛樂影片時強行彈出字幕造成干擾，本插件採**「尊重原生 CC 開關」**設計：請先點擊 YouTube 影片右下角的 **「CC 字幕」按鈕**（底部出現紅線），雙語字幕便會立即啟動。

### Q2：看英文 TED 演講、日文 VTuber、韓綜或國外技術教學影片時，自動字幕 (ASR) 會不會一直跳行？
不會。我們針對 YouTube 自動語音辨識（ASR）設計了「智慧標點合句」與「雙槽對稱鎖定」，將原本碎裂的單字重組為完整句子，並將前一句固定於上槽、當前句於下槽延伸，解決傳統雙語字幕外掛頻繁閃爍跳行的痛點。

### Q3：這款工具可以作為沉浸式翻譯 (Immersive Translate) 或 Language Reactor 的替代方案嗎？
可以。若您的核心需求是**「在 YouTube 上順暢看雙語字幕、反白查單字、重播原聲練聽力」**，且不希望瀏覽器被注入過多全網頁腳本、不想註冊帳號或設定 API Key，本擴充功能是專為 YouTube 最佳化的超輕量免費替代方案。

---

## 🏗️ 系統架構圖 (Architecture Overview)

本專案採用解耦的 **4 層職責分離架構**，詳細技術規格可參閱 [ARCHITECTURE.md](ARCHITECTURE.md)：

```mermaid
flowchart TD
    A["🎬 YouTube 播放器"] -->|"1. 捕捉字幕軌道"| B["📄 攔截哨兵 (inject.js)"]
    B -->|"2. 傳遞軌道資訊"| C["⚙️ 字幕核心與渲染 (content.js)"]
    C -->|"3. 請求中文翻譯"| D["🌐 背景翻譯服務 (background.js)"]
    D <-->|"4. 查快取 / 呼叫 API"| E["☁️ Google 翻譯 / 本機快取"]
    D -->|"5. 回傳翻譯文字"| C
    C -->|"6. 60fps 雙語渲染"| F["🖥️ 雙語字幕畫面 (Overlay)"]
    
    G["🎨 設定面板 (popup)"] -.->|"即時套用開關與設定"| C
```

---

## 🔒 隱私與安全聲明 (Privacy & Security)

* **零個人資料收集**：本擴充功能不收集、不記錄、不傳輸任何使用者的個人隱私、帳號、Cookie 或瀏覽紀錄。
* **權限最小化**：僅申請 `storage` 權限用於記錄您的字級偏好與本機翻譯快取。
* **無外部動態腳本**：100% 符合 Chrome Manifest V3 安全政策，所有程式碼均在本地離線打包。

---

## 📄 開源授權 (License)

本專案採用 [MIT License](LICENSE) 開源授權，歡迎自由學習、修改或提交 PR 共同改進！

