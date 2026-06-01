# Forge Split Extra Networks

將 **txt2img / img2img** 的 **Generation**（參數與畫廊）固定在左側，**Checkpoints、LoRA、Textual Inversion** 等 Extra Networks 獨立在右側，減少分頁切換、提升選模與出圖效率。

專為 **[Stable Diffusion WebUI Forge - Neo](https://github.com/Haoming02/Stable-Diffusion-Webui-Forge-Neo)** 設計，僅新增擴充檔案、不修改核心程式，更新主程式後仍可保留。

![Split layout preview](preview.png)

---

## 功能特色

| 項目 | 說明 |
|------|------|
| 左欄常駐 Generation | 採樣、尺寸、Seed、腳本與畫廊始終可見，無需再點「Generation」分頁 |
| 右欄 Extra Networks | Checkpoints、LoRA、Textual Inversion 等分頁集中在右側 |
| 預設開啟 Lora | 進入頁面時右欄預設為 Lora（若已安裝 Forge LoRA 擴充） |
| 可拖曳調整寬度 | 中間把手拖曳改變右欄寬度，雙擊恢復預設 |
| 記住寬度 | 可選將寬度存入瀏覽器 `localStorage` |
| 響應式 | 窄螢幕自動改為上下堆疊 |
| 非侵入式 | 僅安裝於 `extensions/`，不覆寫 `modules/`、`style.css` 等核心檔 |

## 適用環境

- **主要目標**：WebUI Forge - Neo（Gradio 4）
- **分頁**：txt2img、img2img
- **相依**：內建 Extra Networks（Checkpoints 等）；Lora 分頁需啟用 `sd_forge_lora`（或同等 LoRA 註冊擴充）

## 安裝

### 方式一：手動安裝（推薦）

1. 將本儲存庫複製或下載到 WebUI 的 `extensions` 目錄：

   ```
   <你的 WebUI 根目錄>/extensions/forge-split-extra-networks/
   ```

2. 重新啟動 WebUI，或至 **Settings → Actions → Reload UI**。

3. 在 **Settings → Extensions** 確認 `forge-split-extra-networks` 已啟用。

### 方式二：從 URL 安裝（若已發佈至 GitHub）

1. 開啟 **Extensions** 分頁。
2. 選 **Install from URL**。
3. 貼上本儲存庫 URL，例如：

   ```
   https://github.com/<你的使用者名稱>/forge-split-extra-networks
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

## 使用說明

1. 開啟 **txt2img** 或 **img2img**。
2. **左側**：調整採樣、尺寸、Seed 等，並在畫廊檢視結果。
3. **右側**：切換 Checkpoints、Lora 等，搜尋與點選模型卡片（行為與原版 Extra Networks 相同）。
4. **拖曳** 左右欄之間的虛線把手以調整右欄寬度；**雙擊**把手可恢復預設寬度。

> 右側不再顯示多餘的空白「Generation」分頁；Generation 內容僅在左欄呈現。

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

## 疑難排解

| 現象 | 建議 |
|------|------|
| 版面沒有變化 | 確認擴充已啟用；完整重啟 WebUI；瀏覽器強制重新整理（Ctrl+F5） |
| 右欄沒有 Lora | 確認 `sd_forge_lora` 等 LoRA 擴充已啟用；右欄會 fallback 至第一個可用的 Extra Networks 分頁 |
| 寬度沒有記住 | 確認 Settings 中「Remember panel width」已開啟；勿使用無痕模式阻擋 localStorage |

## 卸載

刪除 `extensions/forge-split-extra-networks` 資料夾後重新啟動 WebUI 即可，不會殘留對核心檔的修改。

## 授權

請依本儲存庫所附的授權條款使用（若未另行標示，建議以 MIT 或與主程式相容之開源授權發佈）。

## 致謝

- [Stable Diffusion WebUI Forge - Neo](https://github.com/Haoming02/Stable-Diffusion-Webui-Forge-Neo)
- Automatic1111 / Gradio 社群的 Extra Networks 介面設計
