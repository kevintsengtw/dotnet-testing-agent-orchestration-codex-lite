# AGENTS.md

## 專案目標

本 repo 提供自含式 .NET Unit Test Lite workflow。優先降低 agent context，並以
實測 line／branch coverage 最大化合理可測程式碼的覆蓋。

## 語言與風格

- 對話與文件使用繁體中文。
- 測試方法使用中文三段式：`方法名_情境描述_預期結果`。
- Markdown fenced code block必須標記語言。

## 正式 topology

`Lite Orchestrator → Lite Unit Author → Lite Unit Verifier`。第一次 verification
若有合理可補的 coverage 或 quality gap，最多再執行一次
`Lite Author repair → Lite Unit Verifier final`。

- 每個 target 一個 Author，不依 methods 或 scenarios split。
- Verifier 可回報 test-only repair，不得修改 production source。
- repair 只傳 compact gap manifest。
- 所有正式 subagent 使用 `fork_turns: "none"`。

## Coverage truth

`.codex/scripts/lite-run-unit-coverage.mjs` 是 build、test 與 coverage 的 deterministic
truth。100% 是預設目標而非造假門檻；無法合理覆蓋時必須列出 lines、branches
與原因。

Lite 擁有的 `.codex/scripts` 入口必須使用 `lite-` 前綴，內部 helper 必須位於
`.codex/scripts/lite-lib/`。不得新增或引用會與原版 workflow 共用路徑的通用名稱。

## Skill 邊界

- Codex Lite Orchestrator 固定在
  `.codex/skills/dotnet-testing-lite-orchestrator-unit/`。
- 可移植 Unit skills 固定在 `.agents/skills/`。
- 不得把 Lite Orchestrator 改成未標示 `lite` 的原版名稱。

## 修改邊界

- workflow 產生的測試只能修改指定 test project。
- production source 不得由 Author 或 Verifier 修改。
- `.orchestrator/`、`TestResults/`、`bin/`、`obj/` 不得簽入。
