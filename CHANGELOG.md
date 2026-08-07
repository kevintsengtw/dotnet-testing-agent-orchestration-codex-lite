# Changelog

所有重要變更都記錄於此文件，版本格式遵循 Semantic Versioning。

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
