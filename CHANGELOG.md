# Changelog

所有重要變更都記錄於此文件，版本格式遵循 Semantic Versioning。

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
