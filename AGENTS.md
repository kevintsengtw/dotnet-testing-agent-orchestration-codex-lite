# AGENTS.md

## 專案目標

本 repo 提供 v1.2.3 自含式 .NET Unit Test Lite workflow。優先降低 agent context，並以
實測 line／branch coverage 最大化合理可測程式碼的覆蓋。

## 語言與風格

- 對話與文件使用繁體中文及臺灣慣用語，直接陳述任務與結果。
- 結論須有實際證據；未執行的驗證、尚未收尾的用量與環境限制如實註明。
- 測試方法使用中文三段式：`方法名_情境描述_預期結果`。
- Markdown fenced code block必須標記語言。

## Workflow 行為的唯一來源

Topology、repair 額度、coverage truth、terminal taxonomy、artifact 路徑與所有執行
規則，一律只定義在下列可移植資產；本檔不重述：

- `.codex/skills/dotnet-testing-lite-orchestrator-unit/**`
- `.codex/agents/dotnet-testing-lite-unit-{author,verifier}.toml`
- `.codex/scripts/dotnet-testing-codex-lite/**`

Contributor 若要改變 workflow 行為，必須修改上述資產與對應 deterministic tests，
不得只在本檔補規則。

## Skill 邊界

- Codex Lite Orchestrator 固定在
  `.codex/skills/dotnet-testing-lite-orchestrator-unit/`。
- 可移植 Unit skills 使用 `.codex/skills/*-lite/` 獨立名稱；不依賴 Full 資產。
- 不得把 Lite Orchestrator 改成未標示 `lite` 的原版名稱。

## Repository 邊界

- 本 repo 只接受 xUnit Unit Test workflow 資產，不加入 TUnit、Integration 或 Aspire workflow。
- `.orchestrator/`、`TestResults/`、`bin/`、`obj/` 不得簽入。
- 升級依 README 與 docs/usage.md 更新完整 Lite 部署單位；保留使用者設定、外部 skills
  與既有執行證據，不以 public workspace 設定整份覆寫其他專案設定。
