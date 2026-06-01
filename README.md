# Forge Split Extra Networks

將 **txt2img / img2img** 的 **Generation**（參數與畫廊）固定在左側，**Checkpoints、LoRA、Textual Inversion** 等 Extra Networks 獨立在右側，減少分頁切換、提升選模效率。

專為 **[Stable Diffusion WebUI Forge - Neo](https://github.com/Haoming02/Stable-Diffusion-Webui-Forge-Neo)** 設計。

![Split layout preview](preview.png)

---

## 功能特色

| 項目 | 說明 |
|------|------|
| 左欄常駐 Generation | 採樣、尺寸、Seed、腳本與畫廊始終可見 |
| 右欄 Extra Networks | Checkpoints、LoRA、Textual Inversion 等分頁集中在右側 |
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

變更「啟用」或預設寬度後，建議執行 **Reload UI**。

## 目錄結構

```
forge-split-extra-networks/
├── README.md
├── preview.png              # 預覽圖
├── metadata.ini
├── style.css                # 雙欄 Grid 樣式
├── javascript/
│   └── split_extra_networks.js
└── scripts/
    └── split_extra_networks.py   # 設定項註冊
```
## 卸載

刪除 `extensions/forge-split-extra-networks` 資料夾後重新啟動 WebUI 即可，不會殘留對核心檔的修改。

## 授權

請依本儲存庫所附的授權條款使用（若未另行標示，建議以 MIT 或與主程式相容之開源授權發佈）。

## 致謝

- [Stable Diffusion WebUI Forge - Neo](https://github.com/Haoming02/Stable-Diffusion-Webui-Forge-Neo)
- Automatic1111 / Gradio 社群的 Extra Networks 介面設計
