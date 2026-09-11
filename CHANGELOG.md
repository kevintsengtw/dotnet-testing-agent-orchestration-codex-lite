# Changelog

所有重要變更都記錄於此文件，版本格式遵循 Semantic Versioning。

## [Unreleased]

## [v1.1.3] - 2026-09-10

### 新增

- 發布流程在建立 GitHub Release 後下載 ZIP 與 tar.gz，逐份拒絕 Full 專用 scripts、
  根目錄 `scripts/` 及其他越界項目，並要求 Lite workflow driver 存在；兩份封存檔的
  SHA-256 會寫入 workflow summary。

### 移除

- Lite runtime 目錄由 `.codex/scripts/dotnet-testing-lite/` 完整遷移為
  `.codex/scripts/dotnet-testing-codex-lite/`，提升與一般 Lite 技能名稱的辨識度；deploy
  更新會移除舊 receipt 管理且內容未變更的 runtime 檔案，保留使用者修改或外來檔案。
- 移除只為早期對照驗證匯入、目前不再使用的原版 Full Unit workflow 共存資產：四個 agents、
  Orchestrator、兩個 scripts、validator、scenario gate、誤置的 `dotnet-test` 鏡像，以及八個
  advanced／Integration／TUnit 技能鏡像；保留基礎導覽與 xUnit v2 升級至 v3 的專門技能。
- Lite coverage runner skill 由 `dotnet-test-lite` 完整重新命名為 `dotnet-testing-lite`；
  部署與移除保留外部 `.codex/skills/dotnet-test`。
- 發布來源檢查加入已退役 Full 資產禁止清單，避免後續誤將整組共存安裝帶回 Lab。

### 驗證

- 已下載既有 `v1.1.2` GitHub Release 的 ZIP 與 tar.gz 實際檢查；兩者各有 278 個原始
  清單項目，`estimate-token-usage.mjs`、`run-state.mjs`、根目錄 `scripts/` 及其他
  `.codex/scripts/` 子項均為 0，必要 Lite driver 存在。
- 最新 Windows Repository Node tests：180/180 通過。

## [v1.1.2] - 2026-09-09

### 新增

- Lite 獨立部署工具與雜湊安裝清單；13 個技術技能改用 `.codex/skills/*-lite/`，保留原始鏡像。
- PR 非模型檢查加入 Windows、macOS、Linux 矩陣與隔離 coverage smoke；最新 CLI／Extension 實際驗收已通過。

- Codex CLI 與 VS Code Extension 以一般提示詞啟動 Lite workflow 時，自動繫結目前主代理回合，
  由背景 observer 收集主代理及其子代理的 runtime 用量，不需要專用啟動腳本、手動收集或 `/exit`。
- 最終報告附上可複製的本機用量網頁網址；網頁顯示各代理與 workflow 合計，並依 runtime
  `turn_context` 分組呈現模型、推理強度及服務模式。
- 網頁提供選用的 Standard credit 前提試算；服務模式缺值時保持未知，且不將觀測值宣稱為帳單。
- 新增跨平台 Node.js cleanup CLI；預設只預覽，支援指定 run、依保存天數、保留最近 N 次及
  清除全部已完成 run，並拒絕刪除 active、未 terminal 或用量 observer 尚未收尾的資料。

### 修正

- 新增 `--retry-build-failed` 受控重跑：核對前次失敗狀態與相同目標，封存原始失敗後才釋放輸出路徑，成功結果仍禁止覆寫。
- 專案標準 bin／obj 寫入受阻可回報環境停止，不放寬 production 原始碼修改範圍。
- 用量啟動失敗且尚無 binding 時，正式報告明示沒有可用統計，並提供已建立的診斷網頁。

- 修正 build_failed／test=null 與 Verifier 決策的契約銜接，確定建置失敗回報 fail 與建置停止原因；補上宿主允許時核准後重跑的指示，不放寬成功判定。

- 用量防重複索引改為工作區內資料，不再寫入使用者家目錄；run 清理同步預覽及移除本次成功刪除 run 的對應索引，另保留孤立索引清理命令。
- Author 指示明確要求 implemented 使用者情境提供對應 scenarioPlan 的 testMethod，補上可由 gate 驗證的範例。
- Lab 的 Windows 驗收工作區集中於 C:/Temp；測試暫存由管理入口收尾清除。此限制不要求使用者把專案安裝在 C:/Temp。

- Runtime 遷移至 `.codex/scripts/dotnet-testing-lite/`，部署參照與升級清理使用 Lite 自有範圍。
- Observer 增加生命週期鎖、收尾標記、啟動失敗診斷與同回合重複繫結防護。
- Cleanup 核對專案身分、完成時間、符號連結與並行狀態；增加只需 Node.js 的中斷復原命令。

- Lite 結果驗證器遇到 `test: null` 時回報契約錯誤，不再因讀取 counts 拋出 TypeError；
  不因此將缺少的測試結果視為通過。

### 移除

- Lite workflow 停止產生與顯示 token 用量估算，移除 Lite 估算器及結算呼叫。
- 結果改為四區；result schemaVersion 升為 3、reportContractVersion 升為 2，
  移除 estimatedTokenUsage、telemetry warnings 與 tokenEstimatePath。
- Observation schemaVersion 升為 2，保留讀寫檔案與技術來源紀錄，移除 token 估算數字。
  既有 tokenEstimateInputs 僅保留作為檔案路徑相容欄位。
- 歷史 benchmark 與原版資產保留，不把舊估算值改稱為 runtime 實際用量。

### 驗證

- 最新 Windows Repository Node tests：171/171 通過。
- 隔離公開快照 net10.0 coverage smoke：22/22，line／branch 100%。
- CLI：34/34 測試通過，line 39/39、branch 22/22；用量正常收尾，共 50 requests、1,769,022 tokens（含快取）。
- VS Code Extension：28/28 測試通過，line 39/39、branch 22/22；用量正常收尾，共 56 requests、2,096,564 tokens（含快取）。
- 兩介面均驗證 NuGet 權限失敗後受控重跑成功，前次失敗證據保留；run／索引預覽及套用清理通過。
- Runtime 提交 `82f3dd3` 的 Windows／macOS／Linux [CI 34243167685](https://github.com/kevintsengtw/dotnet-testing-agent-orchestration-codex-lite-lab/actions/runs/34243167685) 全部通過。

### 資料保存與升級

- 用量網頁、測試證據與工作區索引預設留存；下次啟動不自動清除，使用者以預覽／`--apply` 明確清理。
- 清除單位為整個 run 與其索引；測試原始碼、csproj、bin／obj 及 Codex sessions／SQLite 保留。
- 部署與清除工具只需 Node.js；Python／SQLite 屬用量收集相依。安裝、更新與移除命令見 [使用說明](docs/usage.md)。

## [v1.1.1] - 2026-09-05

### 修正

- 修正部署 `dotnet-test` Skill 的 coverage runner 參照，使用
  `.codex/scripts/lite-unit/run-coverage.mjs`，避免執行時發生 `MODULE_NOT_FOUND`。
- 對齊 Skill 的 build 參數、完整專案測試、production baseline、output 與 repair 說明；
  更新現行共存安裝與 coverage 操作指引。
- 公開快照驗證加入部署 Skill 命令、agent 指示、runtime 相對 module 與子程序路徑
  檢查；回歸測試涵蓋舊入口及遺失相依檔案，歷史 changelog／benchmark 文字保留。

### 驗證

- 本機必要 Node 測試 129/129 通過；回歸檢查可攔下修正前的 Skill 舊入口。
- 隔離公開快照的 net10.0 Skill coverage smoke：22/22 通過，line／branch 皆 100%，
  production integrity 通過。
- net8.0 T01 live：28/28 通過，line 35/35、branch 14/14；Author→Verifier 完成、
  未使用 repair，production／test integrity 與 final handoff 通過。
- 本機驗證使用 Windows；未涵蓋 Linux／Node 20、net9.0 live 或下游 Extension。

### 升級

- 更新完整 Lite 部署資產；runtime 維持集中於 `.codex/scripts/lite-unit/**`，不加入舊入口 shim。
- 下游需在新版 stable Release 發布後取得新的 exact commit archive 與 SHA-256；
  不移動或覆寫 v1.1.0 tag。

## [v1.1.0] - 2026-09-01

因應`dotnet-testing-agent-skills v2.4.2`完成Lite Unit Test workflow重整。模型只負責
Author／Verifier的測試語意工作，workflow state、machine truth、integrity、artifact、
timing、token estimate與繁中final改由集中式deterministic runtime維護。

### 變更

- 將Lite runtime完整集中至`.codex/scripts/lite-unit/**`，由`workflow.mjs`提供唯一
  lifecycle與action入口；public snapshot不再包含根目錄`scripts/`。
- 精簡Lite Orchestrator、Author與Verifier責任：Orchestrator只依driver action調度，Author
  建立或修正test-only交付，Verifier唯讀驗證build、test、target-scoped coverage與測試價值。
- 保持固定Author→Verifier拓樸、每target最多一次repair、GPT-5.6 Sol／medium預設模型及
  13個Unit skills部署邊界。
- 同步上游v2.4.2在既有Unit範圍內的技術資產，不加入TUnit、Integration、Aspire或advanced
  workflow。

### 修正

- 一般測試、no-test、blocked、not-suitable與environment protection路徑共用可驗證的
  lifecycle、project gate、integrity與terminal projection。
- No-test Author artifact可保留描述候選valuable behavior的自然`scenarioPlan`，不再把尚未
  交付的候選test method誤判為既存C#方法；一般test delivery的scenario-to-method gate維持。
- Environment protection正確產生`stopped` phase與`stoppedAt`，不再同時標示`completedAt`。
- Runner在完整TRX／Cobertura產生後才非零退出時，保留machine truth並明確記錄tool incident。
- Presentation replay fixture以CRLF→LF正規化後的文字SHA-256驗證candidate檔案，避免Windows與
  Ubuntu checkout換行差異造成錯誤失敗。
- 繁中final固定由artifacts投影結果摘要、測試內容、修正與異常、耗時及estimated token usage，
  Main只逐字交付driver結果。

### 驗證

- Repository Node tests：125/125通過，其中Lite runtime tests為114項、release／lab tests為11項。
- Lite Orchestrator skill validation與兩個Lite agent TOML解析通過。
- Public consumer snapshot：179個檔案、2個Lite agents、13個Unit skills，白名單驗證通過。
- Final candidate `28615eb`的影響導向live批次為3/3 `hard-pass`，涵蓋no-test contract、
  environment stop lifecycle及一般完整路徑與唯一repair；production mutation為0。

### 發布邊界

- Public repo只接收白名單consumer資產；lab驗證文件、controllers、tests、raw sessions、run
  workspace與其他artifacts不發布。
- Lab repo不建立tag或Release；`v1.1.0` tag與GitHub Release只建立在public consumer repo。

## [v1.0.0] - 2026-08-08

正式穩定版將 Lite runtime 隔離至專屬 script 命名空間，讓原版與 Lite workflow
可以安裝在同一個 workspace，並以完整 Luna max 10-run matrix 驗證改名後的流程。

### 不相容變更

- Lite coverage runner 改名為 `.codex/scripts/lite-run-unit-coverage.mjs`。
- Lite result validator 改名為 `.codex/scripts/lite-validate-unit-result.mjs`。
- Lite helper 由 `.codex/scripts/lib/**` 移至 `.codex/scripts/lite-lib/**`。
- 直接引用舊內部路徑的自訂整合必須改用新的 Lite 路徑；隨版本發布的 agent、skill
  與 runtime 引用已同步更新。

### 變更

- 更新 Lite Verifier 與所有可追蹤引用，完整使用新的 script 命名空間。
- 保留原版 workflow 的通用 script 路徑，避免兩套 workflow 安裝時互相覆寫。
- 強化 public snapshot 白名單，只發布 Lite agent、Lite Orchestrator 與必要的 Lite
  runtime；原版 agents、原版 Orchestrator、lab controller 與測試不會進入公開版。
- README 與公開 README 補充共存安裝方式、命名空間邊界及重新驗證結果。

### 驗證

- Repository tests：120/120 通過。
- GPT-5.6 Luna max Lite matrix：10/10 outer runs、12/12 target executions 完成。
- Terminal decision：8 pass、4 best_effort；quality gate：12/12 pass；6/12 targets
  使用一次 repair。
- Aggregate raw input + output：15,834,891 tokens；workflow duration 合計
  8,833,270 ms（約 2:27:13）。這是 outer 與 Lite agents 的 aggregate telemetry，
  不是 Luna 單一模型的實際帳單。
- 所有 run 都使用新的 Lite runtime 路徑，舊通用 Lite 路徑不存在；production source
  mutation 為 0。

### 發布邊界

- Public repo 只接收白名單 consumer snapshot 與驗證摘要，不發布本次驗證的 raw
  `.workflow`、controller、incident、run workspace 或其他 lab-only 資產。
- Lab repo 不建立 tag；`v1.0.0` tag 與 GitHub Release 只建立在 public consumer repo。

## [v0.2.0] - 2026-08-07

Lite Author 與 Lite Verifier 的預設模型更新為 GPT-5.6 Sol medium，並公開模型
計價、30-run 實驗結果與容量規劃估算。

### 變更

- 將兩個 `dotnet-testing-lite-unit-*` agent 的預設模型由 GPT-5.5 medium 更新為
  GPT-5.6 Sol medium。
- 補充兩個 Lite agent 的預設模型、推理強度與採用理由；GPT-5.6 Sol 與
  GPT-5.5 使用相同單位費率。
- 公開 GPT-5.5 medium、GPT-5.6 Sol medium、GPT-5.6 Terra max 與
  GPT-5.6 Luna max 的 API／Codex Credit 費率比較。
- 公開三組各 10 runs、共 30 runs／36 target executions 的正規化實驗結果、
  token usage、品質、耗時與成本估算。
- 保持 Lite workflow topology、repair 額度、coverage 規則與品質門檻不變。

### 發布邊界

- Public snapshot 仍只包含兩個 Lite agent、Lite Orchestrator、必要 Unit skills、
  deterministic runtime、公開文件與空白 practice samples。
- 實驗只發布正規化的結案報告、技術摘要與 machine-readable 結果；不發布 raw
  `.workflow`、run workspace、controller、incident 或 lab 開發資產。

## [v0.1.0] - 2026-08-03

Codex Lite 首個公開預覽版，提供自含式 .NET Unit Test workflow。

### 新增

- Lite Orchestrator → Lite Unit Author → Lite Unit Verifier 的兩角色流程。
- 最多一次 repair 的 coverage／quality feedback loop。
- build-first xUnit 執行與 target-scoped Cobertura line／branch coverage truth。
- 13 個自含 Unit testing skills、兩個 Codex Lite agents 與 runtime scripts。
- net8.0、net9.0、net10.0 空白 Unit practice scaffold。
- public 白名單同步、版本驗證與 GitHub Release 自動化。

### 發布邊界

- 不發布 benchmarks、securities-trading 實驗樣本、lab 開發 scripts 或 run artifacts。
- lab repo 不建立 tag；版本 tag 與 Release 只存在於 public consumer repo。
