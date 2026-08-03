# Architecture

lite workflow只有兩個 subagent，避免四角色重複載入 source、skills與handoffs。

```text
Lite Orchestrator
  ├─ Lite Unit Author initial
  └─ Lite Unit Verifier
       ├─ build/test/coverage passed and 100% → done
       ├─ repairable gaps → Lite Author repair → Lite Verifier final
       └─ failure/uncoverable gaps → honest report
```

Author同時完成靜態分析與測試撰寫，省略大型 analysis artifact。Verifier把 build、test、coverage與品質審查放在同一 context，避免 Executor輸出再被Reviewer完整重讀。

Deterministic script負責 CLI與Cobertura解析；agent只處理需要判斷的測試設計與gap分類。

## Skill loading

Author 的基本面載入 `unit-test-scenarios`、fundamentals、naming 與 AwesomeAssertions；先形成 compact scenario plan，再寫測試。NSubstitute、xUnit project setup、TimeProvider、System.IO.Abstractions、FluentValidation、AutoFixture/legacy 依 source 特徵載入。Verifier 載入 naming、AwesomeAssertions、`dotnet-test` 與 coverage analysis。

完整 references/templates 保留在 repo，但不會因為 metadata discovery 自動全數進入 context。精簡目標是減少無關載入，不是刪除能力。

## Truth

- Build/test：`run-unit-coverage.mjs` process exit與manifest。
- Coverage：target-scoped Cobertura line/branch。
- User scenarios：author result mapping。
- Quality：verifier issues。
- Token：`estimate-token-usage.mjs` 的 visible text粗估，不代表billing。
