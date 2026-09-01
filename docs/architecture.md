# Architecture

Lite workflow 只有兩個 subagent；Main 不再手工組合 gates、paths 或 terminal 判定，
而是依 deterministic driver 回傳的 action 調度角色。

```text
Main
  └─ .codex/scripts/lite-unit/workflow.mjs start / advance
       ├─ Lite Unit Author initial
       ├─ Lite Unit Verifier initial
       │    ├─ pass / best_effort / blocked / not_suitable / fail → terminal
       │    ├─ tool_incident / environment protection → stopped
       │    └─ needs_repair
       └─ Lite Unit Author repair → Lite Unit Verifier final → terminal
```

Driver 是 lifecycle 的唯一狀態真相，負責唯一 run identity、
`.orchestrator/runs/<run-id>/<target>/` 路徑、同 test project active lock、phase 順序、
deterministic gates、一次 repair 額度、結果投影與 token estimate。Main 只傳遞完整
action payload，不解讀 agent artifact，也不直接呼叫 leaf scripts。

Author 同時完成分析、測試撰寫與實測，省略大型 analysis handoff。Verifier 在同一
context 完成 build、test、target-scoped coverage 與品質審查。repair 與 final 沿用
原本的 Author／Verifier，不建立替代角色。

## Skill selection

13 個 Unit skills 是可選技術來源，不是固定 routing 或必載清單。Author／Verifier
先依 C# 語意、既有專案、deterministic gates 與實測證據工作；只有具體技術疑問時
才選讀最少的相關 skill。實際讀取路徑由phase observation保存，不能以
「採用 skills」自述取代證據。

Lite 的 AwesomeAssertions 新專案預設值定義在 Author policy，不修改上游唯讀的
`dotnet-testing-xunit-project-setup` template。

## Truth and terminal states

- Build/test：`.codex/scripts/lite-unit/run-coverage.mjs`、TRX 與 process exit。
- Coverage：指定 target class 的 Cobertura line／branch。
- User scenarios：author result mapping 與 deterministic gate。
- Quality：verifier issues；uncoverable gap 必須附公開 API 反證。
- Lifecycle：`running|completed|stopped|failed`。
- Decision：`pass|best_effort|blocked|not_suitable|fail|unavailable`。
- Stop reason：environment protection、integrity、contract 或 tool incident。
- Token：固定契約加上申報檔案完整內容的upper-bound estimate；局部讀取可能高估，
  不代表實際visible tokens或provider billing。

`blocked` 專指整個 target 在不改 production 時沒有可用 seam；同 target 仍有可隔離
valuable behavior 時不可整體 blocked。Collector／CLI／result-path 事故則是
`tool_incident`，不得偽裝成 test failure。

任一指定寫入第一次遭環境保護阻擋時立即停止，不改走替代路徑。Driver 驗證受阻路徑、
production integrity與phase ordering，並由dispatch context補上role、phase與target後，以
`lifecycleStatus=stopped` 與 `stopReason=environment_protection` 結束。
