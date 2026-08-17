# 🛒 Chrome Web Store 上架文案與素材規格庫 (Store Listing Guide)

> 本文件提供上架 **Chrome Web Store** 所需的全部欄位文案、短描述、詳細說明與 1280x800 宣傳截圖指引，可直接複製貼上。

---

## 📌 1. 基本資訊 (Basic Info)

* **擴充功能名稱 (Extension Name)**：
  ```text
  YouTube Dual Subtitles & Quick Translate
  ```
* **版本號 (Version)**：
  ```text
  1.1.1
  ```
* **分類 (Category)**：
  ```text
  生產力工具 (Productivity) / 教育與語言學習 (Education)
  ```
* **主要語言 (Primary Language)**：
  ```text
  繁體中文 (Traditional Chinese) 或 英文 (English)
  ```

---

## 📝 2. 商店簡短說明 (Short Description - 嚴格限制 132 字元內)

### 繁體中文版（47 字元）：
```text
支援傳統CC與Gemini即時串流雙軌分流、句級雙槽雙語字幕、60fps零延遲同步與反白查詞原聲重播
```

### 英文版（118 字元）：
```text
Dual-track YouTube dual subtitles with sentence-driven dual-slot streaming, 60fps sync, word lookup & audio replay.
```

---

## 📄 3. 商店詳細說明 (Detailed Description - 複製貼上至後台「詳細說明」欄位)

### 繁體中文版 (Traditional Chinese)：

```text
🎬 YouTube Dual Subtitles & Quick Translate (v1.1)
專為語言學習者、影音創作者與跨國資訊汲取者打造的頂級 YouTube 雙語字幕與即時選詞翻譯擴充功能！

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ 為什麼選擇 YouTube Dual Subtitles？
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌟 1. 首創「雙軌智慧自動分流」架構
• 軌道一（傳統靜態字幕）：自動預載全片字幕，後台全句預翻譯，60fps 二分搜尋同步，拖曳進度條零延遲秒開！
• 軌道二（Gemini ASR 即時串流）：專為 YouTube 新型即時語音辨識打造「句級對稱雙槽滾動引擎」——
  - 上槽 (Slot 1)：永久穩固鎖定上一句已講完的完整長句（英+繁中，0.65 高對比半透明黑膠囊底色背景）。
  - 下槽 (Slot 2)：當前正在講的句子在同一個膠囊內實時逐字吐字延伸，未遇到句號前絕不跳槽折行，句末完結平滑推升！

⚡ 2. 60fps 動畫幀同步（Zero-Delay Sync）
拋棄傳統低頻的 video.timeupdate，採用 requestAnimationFrame 迴圈以 16.6ms 精度即時比對，徹底消除傳統擴充功能 250ms 的字幕落後延遲。

🧠 3. 智慧合句引擎與噪聲清洗（ASR Noise Cleaner）
• 自動將 YouTube 原生破碎短詞聚合成語意通順的完整長句。
• 全面過濾 [Music]、[Laughter]、[Applause]、>>（笑聲與講者切換標記）等原生無效註釋，畫面極致純淨。

🔍 4. 反白即查詞 & 影片原聲重播（Audio Snippet）
• 用滑鼠反白選取字幕上的任意生詞或片語，即刻彈出磨砂玻璃釋義浮窗與音標。
• 點擊「🎬 聽原聲」：播放器自動精準截取影片中講者說出該單詞的原聲切片進行重播，練聽力最道地！
• 點擊「🗣️ 朗讀」：支援標準語音合成發音。

⚡ 5. 鍵盤影子跟讀快捷鍵 (Shadowing Cheatsheet)
• 【R】重播當前整句影片原聲（截取當前句播放，結束後自動暫停，超適合跟讀練習！）。
• 【A】跳至上一句字幕開頭。
• 【D】跳至下一句字幕開頭。

📱 6. YouTube Shorts 短影音自適應
自動識別 Shorts 垂直播放器並調整垂直間距（bottom: 125px），完美避開標題與互動按鈕。

🔒 7. 100% 隱私與安全保證
• 零個人資料收集：不收集、不記錄任何帳號、Cookie 或瀏覽歷史。
• 採用 Chrome Manifest V3 最新安全標準，零外部依賴，純本地安全運算。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 快速上手：
1. 安裝本擴充功能。
2. 開啟任何 YouTube 影片，點擊右下角「CC」字幕按鈕（或按 C 鍵）。
3. 立即享受極速、純淨、流暢的雙語字幕學習體驗！
```

---

### 英文版 (English)：

```text
🎬 YouTube Dual Subtitles & Quick Translate (v1.1)
The ultimate dual-subtitles and instant vocabulary translation extension built for language learners and video enthusiasts!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ Key Features & Highlights:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌟 1. Dual-Track Smart Routing Architecture
• Track 1 (Standard Videos): Full-video pre-translation with 60fps binary-search frame sync. Seeking is instant with 0ms lag!
• Track 2 (Live / Gemini ASR Streams): World-first "Sentence-Driven Dual-Slot Rolling Engine" —
  - Slot 1 (Upper): Securely holds the previous complete finished sentence (Original + Translation in high-contrast 0.65 dark capsule).
  - Slot 2 (Lower): Streams currently spoken words smoothly in real time without line jumping, seamlessly promoting to Slot 1 upon sentence completion!

⚡ 2. 60fps Frame Synchronization (Zero-Delay Sync)
Replaces standard low-frequency timer loops with requestAnimationFrame (16.6ms precision), eliminating the standard 250ms subtitle lag.

🧠 3. Smart Sentence Merging & ASR Noise Cleaner
• Aggregates fragmented speech recognition tokens into natural, grammatically complete sentences.
• Automatically purges [Music], [Laughter], [Applause], and >> speaker cues for a distraction-free view.

🔍 4. Word Lookup & Native Video Audio Replay
• Highlight any word or phrase directly on the subtitles to pop up an instant glassmorphic dictionary tooltip.
• Click "🎬 Play Snippet": The player rewinds and precisely replays the speaker's original voice slice from the video!
• Click "🗣️ Speak": Reads the word aloud via TTS synthesis.

⚡ 5. Shadowing Keyboard Shortcuts
• [R]: Replay current sentence audio from the video (automatically pauses at the end of the sentence for shadowing!).
• [A]: Jump to the beginning of the previous sentence.
• [D]: Jump to the beginning of the next sentence.

📱 6. YouTube Shorts Vertical Layout Adaptation
Automatically detects Shorts players and dynamically adjusts layout (bottom: 125px) to avoid covering titles and UI buttons.

🔒 7. Privacy & Security First
• Zero user tracking: No cookies, browsing history, or personal data collected.
• Fully compliant with Chrome Manifest V3 standard. Zero external dependencies.
```

---

## 🖼️ 4. 官方商店視覺素材規格與生成指南 (Store Assets)

Chrome 線上應用程式商店對於不同展示版位有嚴格的尺寸規範：

| 素材名稱 | 官方規定尺寸 | 必要性 | 展示版位 |
| :--- | :---: | :---: | :--- |
| **螢幕截圖 (Screenshots)** | **1280 x 800** | **必填 (至少 1 張，建議 3~5 張)** | 商店商品詳情頁主要輪播圖 |
| **小型宣傳圖塊 (Small Promo Tile)** | **440 x 280** | **強烈建議必填** | 搜尋結果列表、分類瀏覽頁卡片 |
| **跑馬燈宣傳圖塊 (Marquee Promo Tile)** | **1400 x 560** | **選填（推薦）** | Chrome Web Store 首頁頂部精選推薦大橫幅 |

---

### 🎨 一鍵生成全套 5 款官方規格素材：

本專案內建專門的官方素材生成器：

1. 在瀏覽器中直接開啟本機檔案：
   ```text
   screenshots_generator.html
   ```
2. 點擊頂部的分頁切換素材：
   * **📸 截圖 1 (1280x800)**：句級雙槽雙語滾動（首創引擎）
   * **📸 截圖 2 (1280x800)**：反白選詞與聽原聲發音
   * **📸 截圖 3 (1280x800)**：設定面板與跟讀快捷鍵
   * **🖼️ 小型宣傳圖塊 (440x280)**：精緻卡片圖，專門用於搜尋結果曝光
   * **🌟 跑馬燈宣傳大圖 (1400x560)**：寬螢幕旗艦橫幅，用於首頁精選推薦
3. 點擊綠色按鈕 **「📥 下載當前素材 (PNG)」** 即可自動產出零變形、精準像素的高清 PNG！
4. 直接拖曳上傳至 Chrome 線上應用程式商店後台對應欄位即可！
