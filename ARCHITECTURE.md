# YouTube 雙語字幕與即時選詞翻譯
## 系統架構與資料流說明 (System Architecture & Data Flow)

---

## 1. 簡約系統架構圖 (System Architecture)

本擴充功能採用經典的 **4 層職責分離架構**，模組間單向傳遞，結構清晰解耦：

```mermaid
flowchart TD
    %% 定義節點
    A["🎬 YouTube 播放器"] -->|"1. 捕捉字幕軌道"| B["📄 攔截哨兵 (inject.js)"]
    B -->|"2. 傳遞軌道資訊"| C["⚙️ 字幕核心與渲染 (content.js)"]
    C -->|"3. 請求中文翻譯"| D["🌐 背景翻譯服務 (background.js)"]
    D <-->|"4. 查快取 / 呼叫 API"| E["☁️ Google 翻譯 / 本機快取"]
    D -->|"5. 回傳翻譯文字"| C
    C -->|"6. 60fps 雙語渲染"| F["🖥️ 雙語字幕畫面 (Overlay)"]
    
    %% 設定控制
    G["🎨 設定面板 (popup)"] -.->|"即時套用開關與設定"| C
```

---

## 2. 核心資料流時序圖 (Data Flow Sequence)

由影片載入到畫面呈現，僅需極簡的 **5 個標準步驟**：

```mermaid
sequenceDiagram
    autonumber
    actor User as 使用者
    participant Inject as 攔截哨兵 (inject.js)
    participant Content as 字幕核心 (content.js)
    participant BG as 背景翻譯 (background.js)
    participant Screen as 螢幕畫面 (YouTube UI)

    User->>Inject: 點擊影片播放
    Inject->>Content: 傳送當前字幕軌道資訊
    Content->>Content: 下載原生字幕並依標點斷句
    Content->>BG: 請求翻譯當前句子
    BG->>Content: 回傳繁體中文譯文 (快取秒回 / API)
    Content->>Screen: 60fps 同步渲染雙語字幕！
```

---

## 3. 模組職責快速對照

| 檔案 | 扮演角色 | 核心工作（一句話說明） |
| :--- | :--- | :--- |
| **`inject.js`** | 攔截哨兵 | 負責從 YouTube 原生播放器提取字幕網址與換片事件。 |
| **`content.js`** | 核心大腦 | 負責字幕斷句、時間軸對齊、60fps 畫面渲染與快捷鍵。 |
| **`background.js`** | 翻譯中繼站 | 負責快取管理、Google 翻譯 API 請求與 2.5 秒超時保護。 |
| **`styles.css`** | 視覺外觀 | 定義雙語字幕排版、動態字級、毛玻璃視窗與警告樣式。 |
| **`popup.html / .js`** | 控制遙控器 | 提供總開關、語言切換、字級大小與時間微調設定。 |
