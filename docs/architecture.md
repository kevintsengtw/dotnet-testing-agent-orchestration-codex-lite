# Architecture

Lite workflow 只有兩個 subagent；Main 不再手工組合 gates、paths 或 terminal 判定，
而是依 deterministic driver 回傳的 action 調度角色。

```text
Main
  └─ .codex/scripts/dotnet-testing-codex-lite/nuget-sandbox-preflight.mjs
       └─ status=ready → .codex/scripts/dotnet-testing-codex-lite/workflow.mjs start / advance
            ├─ Lite Unit Author initial
            ├─ Lite Unit Verifier initial
            │    ├─ pass / best_effort / blocked / not_suitable / fail → terminal
            │    ├─ tool_incident / environment protection → stopped
            │    └─ needs_repair
            └─ Lite Unit Author repair → Lite Unit Verifier final → terminal
```

NuGet 預檢在目前 Codex 沙箱先檢查既有 test project，若尚未建立則檢查 target 對應的
來源專案；預檢受阻時不建立 run 或派遣代理。
Driver 是 lifecycle 的唯一狀態真相，負責唯一 run identity、
`.orchestrator/runs/<run-id>/<target>/` 路徑、同 test project active lock、phase 順序、
deterministic gates、一次 repair 額度、結果投影。Main 只傳遞完整
action payload，不解讀 agent artifact，也不直接呼叫 leaf scripts。
派遣 Author／Verifier 時使用對應 TOML 的具名角色，不以 `default` 或派遣參數覆蓋模型。

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

- Build/test：`.codex/scripts/dotnet-testing-codex-lite/run-coverage.mjs`、TRX 與 process exit。
- Coverage：指定 target class 的 Cobertura line／branch。
- User scenarios：author result mapping 與 deterministic gate。
- Quality：verifier issues；uncoverable gap 必須附公開 API 反證。
- Lifecycle：`running|completed|stopped|failed`。
- Decision：`pass|best_effort|blocked|not_suitable|fail|unavailable`。
- Stop reason：environment protection、build_failed、integrity、contract 或 tool incident。
- Token：driver 不產生估算或在 machine result 寫入用量；支援的 Codex runtime 由
  `usage/automatic.mjs` 在測試判定之外啟動背景觀測，terminal Markdown 提供結果網址；啟動失敗時揭露無可用統計及已存在的診斷頁。

`blocked` 專指整個 target 在不改 production 時沒有可用 seam；同 target 仍有可隔離
valuable behavior 時不可整體 blocked。Collector／CLI／result-path 事故則是
`tool_incident`，不得偽裝成 test failure。

Agent 提交 environment stop 時，不改走替代路徑。Driver 驗證受阻路徑、
production integrity與phase ordering，並由dispatch context補上role、phase與target後，以
`lifecycleStatus=stopped` 與 `stopReason=environment_protection` 結束。

Verifier 的標準 runner 若已產生確定的 `build_failed`，可依宿主規則取得核准後，
以相同參數及 `--retry-build-failed` 重跑。Runner 先封存並核對失敗 base／summary，
以 `previousAttemptPath` 保留證據鏈；成功結果、已有測試證據或目標不符仍拒絕覆寫。
未恢復的確定建置失敗回報 `fail/build_failed`，不誤判為語意上的 `blocked`。

Environment stop 可涵蓋 driver 推導的測試專案及 target 所屬專案標準 `bin`／`obj`，
仍檢查路徑邊界與連結，不授權修改 production 原始碼；production integrity 檢查繼續生效。

## 部署與用量資料生命週期

Lite runtime 及 13 個 `.codex/skills/*-lite/` 副本獨立部署；原始 `.agents/skills`
鏡像保留供來源稽核，不是執行期相依。deploy receipt 只管理 Lite 檔案，不覆寫共用設定。

Observer 的 starting／running／settled／failed 與 workflow terminal decision 分開。
Observer 全程持有 writer 鎖，HTML、JSON 全部寫妥後才發布 settled；cleanup 取得相同鎖後
再刪除已完成 run，復原只在本機 PID 已不存在時標記 recovered／incomplete。
中斷或收集失敗不改測試判定，也不要求模型補報 token。
回合繫結索引保存於已部署工作區的 `.orchestrator/dotnet-testing-lite/usage-turns/`，僅防止同一工作區的 root turn 重複計數；run 清理同步處理本次成功移除 run 的索引，另提供孤立索引復原清理命令，不建立全域資料。
Python／SQLite 是收集相依，cleanup 不執行它們。詳細限制見 [使用說明](usage.md)。

資料預設留存，由使用者明確清除；下一次 workflow 不清空前次 run 或索引。產品 cleanup 不刪測試原始碼、csproj、bin／obj 或 Codex sessions／SQLite。Lab 驗收工作區的封存後整體清除是另外授權的操作。
