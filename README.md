# Forge Split Extra Networks

將 **txt2img / img2img** 的 **Generation** 固定在左側，**Checkpoints、LoRA、Textual Inversion** 等 Extra Networks 獨立在右側，減少分頁切換、提升選模效率。內建 **Output Browser**，可在同一畫面瀏覽歷史輸出、套用 PNG info、刪除檔案，無需離開 txt2img / img2img。

專為 Stable Diffusion WebUI Forge - Neo 設計。

![Split layout with Output Browser](preview.png)

*預覽：左側為 Generation；右側 Extra Networks 的 **Output Browser** 分頁（搜尋列、txt2img / img2img 篩選、縮圖網格與右鍵選單）。*

---

## 功能特色

| 項目 | 說明 |
|------|------|
| 左欄常駐 Generation | 採樣、尺寸、Seed、腳本與畫廊始終可見 |
| 右欄 Extra Networks | Checkpoints、LoRA、Textual Inversion、Output Browser 等分頁集中在右側 |
| Output Browser | 瀏覽輸出目錄內圖片；縮圖網格與路徑標籤；**單擊**多選、**雙擊**大圖預覽、**右鍵**送參／刪除 |
| 記住寬度 | 可選將寬度存入瀏覽器 `localStorage` |
| 非侵入式 | 僅安裝於 `extensions/`，不覆寫 `modules/`、`style.css` 等核心檔 |

## 安裝

### 方式一：手動安裝

1. 將本儲存庫複製或下載到 WebUI 的 `extensions` 目錄：

   ```
   <你的 WebUI 根目錄>/extensions/forge-split-extra-networks/
   ```

2. 重新啟動 WebUI，或至 **Settings → Actions → Reload UI**。

3. 在 **Settings → Extensions** 確認 `forge-split-extra-networks` 已啟用。

### 方式二：從 URL 安裝

1. 開啟 **Extensions** 分頁。
2. 選 **Install from URL**。
3. 貼上本儲存庫 URL：

   ```
   https://github.com/BulbulLeung/forge-split-extra-networks.git
   ```

4. 安裝後重新啟動 WebUI。

## 設定

**Settings → Split Extra Networks layout**

| 選項 | 說明 | 預設 |
|------|------|------|
| Enable split layout | 啟用／停用雙欄版面 | 啟用 |
| Default Extra Networks panel width | 右欄預設寬度（px） | 520 |
| Remember panel width after resize | 拖曳後是否記住寬度 | 啟用 |
| Extra Networks preview pane: viewport offset (px) | 右欄縮圖預覽區相對視窗的垂直留白（px）；數值越大，面板越矮 | 320 |
| Show Output Browser tab in Extra Networks | 是否顯示 Output Browser 分頁 | 啟用 |
| Output Browser: maximum number of images to list | 列表最多顯示幾張圖（依修改時間取最新） | 500 |
| Output Browser: selection outline width (px) | 單擊選取縮圖時的高亮邊線粗度 | 5 |
| Extra Networks tab order | 右欄分頁順序（逗號分隔） | output browser,lora,checkpoints,textual inversion |
| Default Extra Networks tab on startup | 啟動時預設開啟的分頁 | output_browser |

變更「啟用」、Output Browser 或預設寬度後，建議執行 **Reload UI**。預覽區 viewport offset（px）變更後通常會立即生效；若未見效果可 **Reload UI**。

### Output Browser

#### 介面

- **位置**：txt2img / img2img → 右側 Extra Networks → **Output Browser** 分頁（可於設定調整分頁順序與啟動預設）。
- **搜尋列**：依檔名、相對路徑、`txt2img/…` 等關鍵字篩選（沿用 Extra Networks 搜尋）。
- **工具列**：名稱／日期排序、日期篩選、**Refresh**（與 LoRA 等分頁相同，重新掃描列表）。
- **txt2img / img2img 按鈕**：快速篩選該模式的輸出（對應 Settings 內各分頁的 samples 路徑）。
- **縮圖卡片**：底部顯示相對路徑（例如 `txt2img/2026-02-28/0273-1108391704.png`）。

#### 操作

- **單擊**卡片：高亮選取（類似檔案總管，邊線粗度可在設定調整）；**Ctrl+單擊**切換選取、**Shift+單擊**從錨點連續選取；**Ctrl+Shift+單擊**在保留既有選取下追加範圍。
- **雙擊**卡片：以單圖預覽層顯示大圖；**Esc** 或點背景／關閉鈕可關閉預覽。大圖開啟時 **← / →** 切換上一張／下一張；大圖下 **Del** 刪除目前圖片並自動顯示下一張（若無下一張則關閉）。
- **拖放**卡片至左側 **Prompt**、**畫廊** 或 **Generation** 區：依**目前主分頁**套用 PNG info（txt2img 主分頁 → txt2img 欄位；img2img 主分頁 → img2img 欄位），效果與右鍵 **Send to txt2img/img2img** 相同。
- **拖放**至 img2img 頁左側 **Init / Sketch / Inpaint** 畫布（ForgeCanvas）：**載入圖片**至目前可見的 image input，等同點選 Load image；**不會**套用 PNG info。拖到 Prompt／畫廊等仍為上述 PNG info 行為。
- **右鍵**卡片：功能選單
  - **Send to txt2img** / **Send to img2img**：讀取**右鍵那張**圖的 PNG info，寫入對應分頁欄位並自動切換主分頁（僅單張）。
  - **Delete**：刪除**目前選取**的圖片（無選取時刪右鍵那張）；刪除前會跳出確認對話框。
- **Delete 鍵**：在列表已選取圖片時，按 **Del** 與右鍵 Delete 相同（在輸入框內打字時不會觸發；大圖開啟時則刪除目前大圖）。
- 點 **Refresh** 或刪除後重新載入列表時，**捲動位置會維持**在 refresh 前的位置，不會跳回最上方。
- 新增或變更輸出圖後，在 Extra Networks 面板點 **Refresh** 更新列表。

## 目錄結構

```
forge-split-extra-networks/
├── README.md
├── preview.png              # 預覽圖
├── metadata.ini
├── style.css                # 雙欄 Grid 樣式
├── ui_extra_networks_output_browser.py
├── javascript/
│   ├── split_extra_networks.js
│   └── output_browser.js
└── scripts/
    ├── split_extra_networks.py   # 設定項與 Output Browser 註冊
    └── output_browser_api.py     # infotext / delete API
```

## 卸載

刪除 `extensions/forge-split-extra-networks` 資料夾後重新啟動 WebUI 即可，不會殘留對核心檔的修改。

## 授權

請依本儲存庫所附的授權條款使用（若未另行標示，建議以 MIT 或與主程式相容之開源授權發佈）。

## 致謝

- [Stable Diffusion WebUI Forge - Neo](https://github.com/Haoming02/Stable-Diffusion-Webui-Forge-Neo)
- Automatic1111 / Gradio 社群的 Extra Networks 介面設計
