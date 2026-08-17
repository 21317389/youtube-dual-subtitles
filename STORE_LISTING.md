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

### 3. 英文版 (English)：

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

### 4. 日本語版 (Japanese)：

```text
🎬 YouTube デュアル字幕 & 単語翻訳 (v1.1)
言語学習者、動画クリエイター、情報収集者のための最高峰 YouTube デュアル字幕＆単語翻訳拡張機能！

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ YouTube Dual Subtitles の特徴
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌟 1. 業界初「デュアルトラック・スマートルーティング」構造
• トラック 1（従来の字幕）：動画全体の字幕を事前取得＆バックグラウンド事前翻訳。60fps バイナリサーチ同期でシーク時も遅延ゼロ！
• トラック 2（Gemini ASR リアルタイムストリーム）：新世代の「文単位デュアルスロット・ローリングエンジン」を搭載 —
  - スロット 1 (上段)：直前の完了した完全な文を確実に固定表示（原文＋翻訳文、高コントラスト 0.65 半透明カプセル背景）。
  - スロット 2 (下段)：現在話されている文をリアルタイムでスムーズに拡張表示し、句末記号で自動的にスロット1へ移行！

⚡ 2. 60fps アニメーションフレーム同期（Zero-Delay Sync）
低頻度の video.timeupdate を廃止し、requestAnimationFrame ループによる 16.6ms 精度で同期。従来の 250ms 字幕遅延を完全解消。

🧠 3. スマート合文エンジン＆ノイズクリーナー
• YouTube の断片的な単語を自動で自然な文章に結合。
• [音楽]、[笑い声]、>>（話者切替記号）などの無効なノイズ注釈を自動フィルタリング。

🔍 4. 単語選択翻訳 ＆ 動画原音再生（Audio Snippet）
• 字幕上の単語をマウスで選択するだけで、フロストガラス調の辞書ポップアップと発音記号が即座に表示。
• 「🎬 原音を聴く」：動画内の話者の実際の発音スライスを正確に切り出してリプレイ！
• 「🗣️ 音声読上げ」：標準TTS発音に対応。

⚡ 5. シャドーイング用ショートカットキー
• 【R】現在の文の音声をリプレイ（再生後に自動一時停止、シャドーイング練習に最適！）。
• 【A】前の字幕の先頭にジャンプ。
• 【D】次の字幕の先頭にジャンプ。

📱 6. YouTube Shorts 縦型動画レイアウト自動適応
Shorts プレーヤーを自動認識し、垂直間隔（bottom: 125px）を調整してタイトルやボタンとの重なりを防止。

🔒 7. 100% のプライバシーとセキュリティ
個人情報の収集は一切行いません。Chrome Manifest V3 標準に完全準拠、外部依存ゼロの安全なローカル実行。
```

---

### 5. 한국어판 (Korean)：

```text
🎬 YouTube 듀얼 자막 & 실시간 단어 번역 (v1.1)
언어 학습자, 크리에이터 및 글로벌 콘텐츠 시청자를 위한 프리미엄 YouTube 듀얼 자막 및 즉시 단어 번역 확장 프로그램!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ YouTube Dual Subtitles 핵심 기능
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌟 1. 최초의 "듀얼 트랙 스마트 라우팅" 아키텍처
• 트랙 1 (기존 고정 자막): 전체 자막 사전 다운로드 및 백그라운드 사전 번역. 60fps 이진 탐색 동기화로 타임라인 탐색 시 0ms 지연!
• 트랙 2 (Gemini ASR 실시간 스트리밍): 최신 실시간 음성 인식용 "문장 단위 듀얼 슬롯 롤링 엔진" 탑재 —
  - 슬롯 1 (상단): 이전의 완성된 전체 문장을 안정적으로 고정 표시 (원문 + 번역문, 0.65 반투명 블랙 캡슐 배경).
  - 슬롯 2 (하단): 현재 말하고 있는 문장을 실시간으로 부드럽게 이어 표시하며, 문장 부호 완료 시 상단으로 자연스럽게 전환!

⚡ 2. 60fps 애니메이션 프레임 동기화 (Zero-Delay Sync)
기존의 저주파 video.timeupdate 대신 requestAnimationFrame을 사용하여 16.6ms 정밀도로 동기화, 250ms의 자막 지연을 완전히 제거합니다.

🧠 3. 스마트 문장 결합 및 노이즈 클리너
• 끊어진 음성 인식 단어들을 문맥에 맞는 자연스러운 전체 문장으로 결합합니다.
• [음악], [웃음소리], >> (화자 전환 기호) 등의 불필요한 주석을 자동으로 제거하여 깔끔한 화면을 제공합니다.

🔍 4. 단어 선택 번역 및 비디오 원음 재생 (Audio Snippet)
• 자막의 단어나 구문을 마우스로 드래그하면 글래스모피즘 사전 팝업이 즉시 나타납니다.
• "🎬 원음 재생" 클릭: 비디오 속 화자의 실제 음성 구간을 정확히 잘라내어 재생합니다!
• "🗣️ 음성 읽기": 표준 음성 합성(TTS) 지원.

⚡ 5. 섀도잉 단축키 지원
• 【R】현재 문장 비디오 원음 다시 듣기 (재생 후 자동 일시 정지, 섀도잉 학습에 최적!).
• 【A】이전 자막으로 이동.
• 【D】다음 자막으로 이동.

📱 6. YouTube Shorts 세로 비디오 레이아웃 자동 지원
Shorts 플레이어를 자동 감지하여 하단 여백(bottom: 125px)을 조정, 버튼과의 간섭을 방지합니다.

🔒 7. 100% 개인정보 보호 및 안전 보장
어떠한 개인정보도 수집하지 않습니다. Chrome Manifest V3 표준을 완벽 준수하며 외부 의존성 없이 로컬에서 안전하게 작동합니다.
```

---

### 6. Español (Spanish)：

```text
🎬 Subtítulos Dobles y Traducción Rápida para YouTube (v1.1)
¡La mejor extensión de subtítulos dobles y traducción instantánea de vocabulario para estudiantes de idiomas y creadores!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ Características Principales:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌟 1. Arquitectura Inteligente de Doble Ruta
• Ruta 1 (Videos Estándar): Pre-traducción completa y sincronización a 60 fps con búsqueda binaria. ¡Avance instantáneo con 0 ms de retraso!
• Ruta 2 (Streaming Gemini ASR en vivo): Motor de doble ranura basado en oraciones completas —
  - Ranura 1 (Superior): Mantiene fija la oración anterior completa (original + traducción en cápsula de contraste 0.65).
  - Ranura 2 (Inferior): Muestra en tiempo real las palabras habladas y se traslada suavemente a la ranura superior al terminar la oración.

⚡ 2. Sincronización a 60 fps (Cero Retraso)
Reemplaza los temporizadores lentos con bucles requestAnimationFrame (precisión de 16.6 ms), eliminando el retraso habitual de 250 ms.

🧠 3. Unión Inteligente de Oraciones y Filtro de Ruido
• Une palabras fragmentadas en oraciones naturales y gramaticalmente correctas.
• Filtra automáticamente anotaciones como [Música], [Risas], [Aplausos] y marcas >> para una vista limpia.

🔍 4. Traducción al Seleccionar y Reproducción de Audio Original
• Selecciona cualquier palabra del subtítulo para abrir una ventana flotante con la definición.
• "🎬 Reproducir audio original": ¡Reproduce el fragmento exacto de la voz del hablante en el video!
• "🗣️ Pronunciar": Lectura de texto mediante síntesis de voz.

⚡ 5. Atajos de Teclado para Shadowing
• [R]: Repetir audio de la frase actual (pausa automática al final).
• [A]: Ir al subtítulo anterior.
• [D]: Ir al subtítulo siguiente.

📱 6. Adaptación para YouTube Shorts
Detecta videos verticales Shorts y ajusta la posición (bottom: 125px) para evitar tapar títulos y botones.

🔒 7. Privacidad y Seguridad Garantizadas
Sin rastreo de usuarios. Cumple con el estándar Chrome Manifest V3 sin dependencias externas.
```

---

### 7. 简体中文版 (Simplified Chinese)：

```text
🎬 YouTube 双语字幕与实时划词翻译 (v1.1)
专为语言学习者、视频创作者与跨国资讯获取者打造的顶级 YouTube 双语字幕与即时划词翻译扩展！

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ 核心特色与优势：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌟 1. 首创“双轨智能自动分流”架构
• 轨道一（传统静态字幕）：自动预载全片字幕，后台全句预翻译，60fps 二分搜索同步，拖动进度条零延迟秒开！
• 轨道二（Gemini ASR 实时流）：专为 YouTube 新型实时语音识别打造“句级对称双槽滚动引擎”——
  - 上槽 (Slot 1)：永久稳固锁定上一句已讲完的完整长句（英+简中，0.65 高对比半透明黑胶囊底色背景）。
  - 下槽 (Slot 2)：当前正在讲的句子在同一个胶囊内实时逐字吐字延伸，未遇到句号前绝不跳槽折行，句末平滑推升！

⚡ 2. 60fps 动画帧同步（Zero-Delay Sync）
抛弃传统低频的 video.timeupdate，采用 requestAnimationFrame 循环以 16.6ms 精度实时比对，彻底消除传统扩展 250ms 的字幕落后延迟。

🧠 3. 智能合句引擎与噪声清洗（ASR Noise Cleaner）
• 自动将 YouTube 原生破碎短词聚合成语义通顺的完整长句。
• 全面过滤 [Music]、[Laughter]、[Applause]、>>（笑声与讲者切换标记）等原生无效注释，画面极致纯净。

🔍 4. 划词即查词 & 视频原声重播（Audio Snippet）
• 鼠标划选字幕上的任意生词或短语，即刻弹出磨砂玻璃释义浮窗与音标。
• 点击“🎬 听原声”：播放器自动精准截取视频中讲者说出该单词的原声切片进行重播，练听力最地道！
• 点击“🗣️ 朗读”：支持标准语音合成发音。

⚡ 5. 键盘影子跟读快捷键 (Shadowing Cheatsheet)
• 【R】重播当前整句视频原声（截取当前句播放，结束后自动暂停，超适合跟读练习！）。
• 【A】跳至上一句字幕开头。
• 【D】跳至下一句字幕开头。

📱 6. YouTube Shorts 短视频自适应
自动识别 Shorts 垂直播放器并调整垂直间距（bottom: 125px），完美避开标题与互动按钮。

🔒 7. 100% 隐私与安全保证
• 零个人数据收集：不收集、不记录任何账号、Cookie 或浏览历史。
• 采用 Chrome Manifest V3 最新安全标准，零外部依赖，纯本地安全运行。
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
