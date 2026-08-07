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

Author `initial` 只固定讀 `dotnet-testing-unit-authoring`；scenario 契約已內化，
不載入 standalone `unit-test-scenarios`，也不預設讀 fundamentals、naming 或
AwesomeAssertions。NSubstitute、xUnit project setup、TimeProvider、
System.IO.Abstractions、FluentValidation 與 unit patterns 只依 source seam 或
明確 repair gap 條件式載入。

Verifier 固定讀 `dotnet-test` 取得 build-first execution contract；命名由 strict
script 驗證，assertion 與 coverage rubric 已內化，因此不預設讀 naming、
AwesomeAssertions 或通用 `dotnet-testing-code-coverage-analysis`。

完整 references/templates 保留在 repo，但不會因為 metadata discovery 自動全數進入 context。精簡目標是減少無關載入，不是刪除能力。

## Truth

- Build/test：`run-unit-coverage.mjs` process exit與manifest。
- Coverage：target-scoped Cobertura line/branch。
- User scenarios：author result mapping。
- Quality：verifier issues；uncoverable gap 必須附可由 gate 驗證的公開 API 反證。
- Token：`lite-estimate-token-usage.mjs` 的 visible text粗估，不代表billing。
