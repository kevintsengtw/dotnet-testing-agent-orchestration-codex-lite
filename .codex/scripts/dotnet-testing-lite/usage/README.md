# Codex CLI／Extension 自動 workflow 用量

一般提示詞啟動 Lite workflow、driver 執行 `start` 時，自動繫結目前 Codex CLI 或 Extension
thread 的唯一活動回合，啟動背景觀測。不需要驗收 PS1、特製提示詞、
無關工作或 `/exit`。不變更 Author、Verifier、測試品質關卡或最終判定。

結果放在該次 `runRoot/usage/`：`binding.json`、`report.json`、
各代理的用量欄位快照、`result.json`、`result.html`、`observer.log`。
啟動時先建立等待頁；背景程序等主代理回合完成及三次用量觀測一致，才更新 HTML。
driver 的最終 Markdown 附上可複製到瀏覽器網址列的 `file:///` 網址。
不自動開啟瀏覽器；若較早開啟頁面，請於最後回覆完成後稍候並重新整理。

## 條件與限制

- 用量收集需要 Node.js 20.11+、Python 3.8+（含 sqlite3；依序偵測 `python`／`python3`）、`CODEX_THREAD_ID`、可讀取的 Codex sessions 與
  `state_5.sqlite`；使用內部紀錄格式，不保證未來 CLI 版本相容。
- 僅在 session metadata 的 source 為已驗證的 `cli` 或 `vscode` 時啟用；其他 host
  不會自動猜測或啟動背景觀測。
- 一個主代理回合只能有一個 workflow。跨回合續跑及同回合混入其他工作
  尚不支援；不可將這些情境的結果解讀為精確 workflow 用量。
- 等待上限兩小時。資料不足或回合中止會標示未完成，不提供 credit 合計。
  觀測一致不是帳務結算保證；資料庫未落盤的子代理仍有偵測限制。
- credit 為網頁上的選用 Standard 試算，按請求當時的模型分組；
  缺少服務模式仍保留未知，不宣稱實際 Standard。費率為網頁標示日期的版本。
- 本機 Codex CLI 與 VS Code Codex Extension 是預定環境；遠端、容器或受限執行環境
  可能只能取得檔案或無法啟動背景程序。Extension 實測工具程序會提供
  `CODEX_THREAD_ID`，但不一定提供 `CODEX_HOME`；缺值時回退到使用者的 `.codex`。
- 設定 `LITE_USAGE_AUTOMATIC=0` 可停用。既有量測 wrapper 設定
  `LITE_USAGE_BINDING_PATH` 時自動跳過，避免重複收集。

## 保存與清理

**預設留存，由使用者明確清除；下次 workflow 啟動前不會自動刪除前次結果。**

每次 workflow 都建立新的 `.orchestrator/runs/<run-id>/<target>/`，用量網頁、各代理用量快照、
TRX、coverage 與其他 workflow 證據會隨執行次數累積。`.gitignore` 只避免簽入，並不清除磁碟資料。
Runtime 不會自動刪除歷史 run，避免尚在診斷或稽核的證據意外消失。

Windows、macOS 與 Linux 均使用同一個 Node.js cleanup CLI。所有命令預設只預覽；確認輸出的
`selected` 清單後加上 `--apply` 才會刪除。下列 `<test-project.csproj>` 均替換成實際測試專案路徑：

```text
# 預覽或刪除指定 run
node .codex/scripts/dotnet-testing-lite/usage/cleanup.mjs --test-project <test-project.csproj> --run-id <run-id>
node .codex/scripts/dotnet-testing-lite/usage/cleanup.mjs --test-project <test-project.csproj> --run-id <run-id> --apply

# 刪除超過 30 天的 run，但至少保留最近 10 個已完成 run
node .codex/scripts/dotnet-testing-lite/usage/cleanup.mjs --test-project <test-project.csproj> --older-than-days 30 --keep 10
node .codex/scripts/dotnet-testing-lite/usage/cleanup.mjs --test-project <test-project.csproj> --older-than-days 30 --keep 10 --apply

# 預覽或刪除全部已完成 run
node .codex/scripts/dotnet-testing-lite/usage/cleanup.mjs --test-project <test-project.csproj> --all-completed
node .codex/scripts/dotnet-testing-lite/usage/cleanup.mjs --test-project <test-project.csproj> --all-completed --apply
```

Cleanup 只需要 Node.js 20.11+，不執行 Python、不查詢或刪除 Codex sessions／SQLite。
刪除單位是**整個 run**，包括 HTML、JSON、TRX、coverage 與測試證據；舊網址會失效，
不經資源回收筒。請先備份需要保存的證據。測試原始碼、csproj 與專案 bin／obj 不會被刪除。
HTML 是內嵌資料快照，可單獨備份；它不會持續讀取資料庫，也不會自動更新已開啟的頁面。

工具核對 manifest 的測試專案、runRoot、manifestPath、terminal 狀態與完成時間。
符號連結／junction、損毀資料、active run、observer 寫入中及無法辨識的舊格式均跳過。
`--older-than-days` 與 `--keep` 使用完成時間，缺少或未來時間不以目錄時間代替。
`selected` 是本次候選，`retained` 是保留的最近 N 次，`skipped` 附原因；
套用會重新檢查，僅 `removed` 表示成功，`failures` 表示部分失敗並令 CLI 回傳非零。
不同時間的預覽與套用可能因狀態改變而有不同範圍；需要固定一次 run 時使用 `--run-id`。

含空白路徑的 PowerShell／bash／zsh 共用範例：

```text
node .codex/scripts/dotnet-testing-lite/usage/cleanup.mjs --test-project "tests/My Project/My.Tests.csproj" --all-completed --keep 10
node .codex/scripts/dotnet-testing-lite/usage/cleanup.mjs --test-project "tests/My Project/My.Tests.csproj" --all-completed --keep 10 --apply
```

## Observer 中斷與復原

`observer-state.json` 記錄 starting／running／settled／failed；復原後為 recovered。
Observer 持有整段生命週期的 writer 鎖；完整 JSON 與 HTML 寫妥才發布 settled。
啟動失敗、可處理的中止訊號與寫入例外會記錄 failed；SIGKILL、重開機等無法執行收尾的情況
可能留下 running／starting 與等待頁，不能單凭等待多久便視為完成。

以下命令只核對本機 PID 是否已不存在（ESRCH），不會終止任何程序，也不執行 Python。
同名主機上的 PID 若仍存在、權限不足、不同主機或缺少可靠 owner，均拒絕復原。
若 PID 被重用，寧可保留；舊版缺乏 owner 的 run 不自動移除，需先備份並人工核對原 observer。

```text
node .codex/scripts/dotnet-testing-lite/usage/recover.mjs "tests/My Project/.orchestrator/runs/RUN/TARGET/usage"
node .codex/scripts/dotnet-testing-lite/usage/recover.mjs "tests/My Project/.orchestrator/runs/RUN/TARGET/usage" --apply
```

復原只發布 incomplete 用量快照，不會改 workflow terminal decision 或解除 active-run lock。
之後仍須由 cleanup 核對該 run 已 terminal，才可刪除。
已部署工作區內的 `.orchestrator/dotnet-testing-lite/usage-turns/` 保存回合防重複繫結紀錄。
防重複只涵蓋同一工作區；不同工作區的同回合報告不可相加視為互不重複的用量。
run cleanup 會同步預覽並移除本次成功刪除 run 的對應索引，一般清理不需要再執行另一道命令。只有曾手動刪除 run 或索引清理失敗時，才使用下列命令清理孤立索引；仍有 run、損毀或未知項目保留：

```text
node .codex/scripts/dotnet-testing-lite/usage/workspace-index.mjs
node .codex/scripts/dotnet-testing-lite/usage/workspace-index.mjs --apply
```

索引跟隨工作區管理；移除 Lite 前先完成以上清理，或在整個工作區完成證據備份後一起移除。
防護涵蓋遵守本鎖定協定的 Lite 程序，不提供對惡意外部程序持續替換路徑的隔離保證。

## 驗證範圍

本次 scripts 遷移後已執行 Windows 非模型測試；macOS／Linux 由 PR CI 矩陣驗證，
未取得 CI 結果前不宣稱三平台通過。CLI／Extension 新版完整驗收仍待使用者操作。
以下是**遷移前**的歷史驗收摘要，不能代替新版驗收。

一般提示詞的真實 CLI 已成功產生主代理與兩個子代理用量，44 requests、
1,514,432 tokens（含快取），並依 Standard 前提試算為 34.06704 credits。
最終報告提供網址且不自動開啟瀏覽器的交付方式已完成 CLI 實際驗收。

Extension 一般提示詞自動入口已於 2026-09-07 完成實際驗收：runtime source
為 `vscode`、Codex 0.153.0，主代理與兩個子代理皆為 gpt-5.6-sol／medium。
合計 38 requests、1,235,201 tokens（含快取），依網頁保存費率的 Standard
前提試算為 31.22986 credits；三者服務模式均未記錄，仍保留未知。
背景結果為 `observed-complete`，缺漏、不完整與未解析請求清單皆空白，
最終回覆已附可複製的網址，使用者已開啟網頁確認。
原始驗收資料曾保存於獨立 acceptance 工作區；完成核對與工作區整理後不再保留該暫存目錄，
驗收數值與狀態保留於本段紀錄。
該次測試報告另有 runner exit code 1 工具異常；本項驗收確認用量自動收集與網址交付，
未調整測試判定規則，亦未釐清 runner 異常原因。

Lite 不會在使用者家目錄建立索引，也不再接受 LITE_USAGE_STATE_HOME 覆寫。Codex sessions／SQLite 仍僅供唯讀收集。
