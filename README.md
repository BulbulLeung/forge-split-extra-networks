# Forge Split Extra Networks

將 **txt2img / img2img** 的 **Generation**（參數與畫廊）固定在左側，**Checkpoints、LoRA、Textual Inversion** 等 Extra Networks 獨立在右側，減少分頁切換、提升選模效率。

專為 [Stable Diffusion WebUI Forge - Neo] 設計。

![Split layout preview](preview.png)

---

## 功能特色

| 項目 | 說明 |
|------|------|
| 左欄常駐 Generation | 採樣、尺寸、Seed、腳本與畫廊始終可見 |
| 右欄 Extra Networks | Checkpoints、LoRA、Textual Inversion 等分頁集中在右側 |
| Output Browser | 瀏覽 Settings 中設定的輸出目錄（samples）內圖片，卡片縮圖、單擊 Lightbox 大圖預覽 |
| 可拖曳調整寬度 | 中間把手拖曳改變右欄寬度，雙擊恢復預設 |
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
| Show Output Browser tab in Extra Networks | 是否顯示 Output Browser 分頁 | 啟用 |
| Output Browser: maximum number of images to list | 列表最多顯示幾張圖（依修改時間取最新） | 500 |
| Extra Networks tab order | 右欄分頁順序（逗號分隔） | output browser,lora,checkpoints,textual inversion |
| Default Extra Networks tab on startup | 啟動時預設開啟的分頁 | output_browser |

變更「啟用」、Output Browser 或預設寬度後，建議執行 **Reload UI**。

### Output Browser

- **txt2img** 分頁：掃描 `outdir_samples`（若已設定）或 **Output Directory for txt2img Images**。
- **img2img** 分頁：掃描 `outdir_samples` 或 **Output Directory for img2img Images**。
- 上部固定顯示 **txt2img**、**img2img** 兩個按鈕（對應 Settings 中各分頁的 samples 輸出路徑，不受全域 `outdir_samples` 影響）。
- 點選 **txt2img** 或 **img2img** 後，下方顯示該目錄及其**所有子資料夾**內的圖片（遞迴掃描）；不含 grids 目錄。
- **單擊**卡片：高亮選取（類似檔案總管）；**Ctrl+單擊**切換選取、**Shift+單擊**從錨點連續選取；**Ctrl+Shift+單擊**在保留既有選取下追加範圍。
- **雙擊**卡片：以單圖預覽層顯示大圖；**Esc** 或點背景／關閉鈕可關閉預覽。
- **右鍵**卡片：功能選單
  - **Send to txt2img** / **Send to img2img**：將**右鍵那張**圖的 PNG info 套用至對應分頁參數並自動切換分頁，僅單張。
  - **Delete**：刪除**目前選取**的圖片（無選取時刪右鍵那張）；刪除前會跳出確認對話框。
  - **Delete 鍵**：在 Output Browser 已選取圖片時，按鍵盤 **Del** 與右鍵 Delete 相同（在輸入框內打字時不會觸發）。
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
