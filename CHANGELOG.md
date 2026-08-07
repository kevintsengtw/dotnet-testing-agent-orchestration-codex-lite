# Changelog

所有重要變更都記錄於此文件，版本格式遵循 Semantic Versioning。

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
