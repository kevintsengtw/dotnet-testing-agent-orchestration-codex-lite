---
name: dotnet-testing-lite-orchestrator-unit
description: Codex Lite 專屬 .NET Unit Test workflow；以兩個 self-contained subagent 產生、執行並依實測 coverage 與 value-aware quality gate 補強 xUnit tests。只在 dotnet-testing-agent-orchestration-codex-lite 專案使用。
---

# .NET Unit Test Lite Orchestrator

你只負責調度與摘要，不讀 source、不寫 tests、不直接執行 `dotnet`。

## 必要輸入

- target source path
- target class
- test project path（可為既有 csproj，或預計建立的新 csproj path）
- optional user scenarios

缺少任一必要 path 時只詢問缺少值。`test project path` 尚不存在不是缺少輸入；
這代表本輪必須建立可持續保留的 test project。

## 流程

1. 將 `testProjectPath` 正規化為絕對路徑，唯一合法的 `orchestratorRoot` 是
   `<test project directory>/.orchestrator`；不得放在 workspace root、
   renamed wrapper、`targets/` 或另建 placeholder project。既有 target 殘留只清理
   下列 target-scoped paths，不刪除其他 target artifacts。csproj 已存在時標示
   `testProjectMode: use-existing`；尚不存在則保留 path 並標示
   `testProjectMode: create`。
2. 所有 paths 都從同一個 `orchestratorRoot` 計算：
   - `outputTestPath`
   - `.orchestrator/input/<Target>.user-scenarios.json`
   - `.orchestrator/runs/<Target>.json`
   - `.orchestrator/baseline/<Target>.{production,tests}.json`
   - `.orchestrator/author/<Target>.author.json`
   - `.orchestrator/verification/<Target>.{project,coverage}.json`
   - `.orchestrator/repair/<Target>.json`
   - `.orchestrator/handoff/<Target>.final.json`
3. 若同一請求有多個 target，先依正規化後的 `testProjectPath` 分組。同一 test
   project 的 target workflow 必須完整串行，前一個 target finish 後才能啟動下一個
   target 的 run manifest；不得預建後續 run 讓排隊時間污染 duration。禁止讓兩個
   Author、Verifier 或 coverage runner 同時讀寫同一 test project。不同 test
   project 才可並行。
4. 用 `scripts/record-workflow-run.mjs start` 建立 run，以
   `scripts/create-user-scenario-manifest.mjs` 正規化 scenarios（無輸入仍建立），再執行：
   `scripts/check-production-integrity.mjs capture --target-source ... --output ...`。
5. 使用 `fork_turns: "none"` dispatch `.codex/agents/dotnet-testing-lite-unit-author.toml`，
   `mode: initial`；payload 只傳上述 paths，不內聯 manifest。
6. Author 後依序執行 `check-unit-author-result.mjs`、`check-test-project.mjs`；
   任一非零立即停止。
   通過後以 `check-test-integrity.mjs capture` 保存 test hashes，才用
   `fork_turns: "none"` dispatch
   `.codex/agents/dotnet-testing-lite-unit-verifier.toml`，payload 使用
   `projectValidationPath` 與 `verificationOutputPath`，`isFinal: false`。
   dispatch 前以 `record-workflow-run.mjs phase --status running --artifact
   <agentResultPath>` 標記；重複 `--preserve` 傳 test/csproj，final 另傳既有
   verification base/summary/supplement。
   回傳後用相同 phase/mode、最終 status/artifact 記錄 duration 與
   `.orchestrator/observations/<Target>/<phase>-<mode>.json`。recorder 會自動排除
   deterministic script telemetry，並把沒有 snapshot 的 `pre-phase` 降為
   `post-phase`、留下 warning；不得為了修正 telemetry 重派 agent 或耗用 repair。
   不得猜測執行次數/耗時。
   若 Author artifact 是 `no_valuable_tests`，test-project gate 使用
   `--allow-no-test-files`，仍 dispatch 該 Verifier 做獨立 suitability review，
   但不執行 build/test/coverage。確認後以 `not_suitable` 正常終止；
   不進 repair，也不得由 Main 或 Author 單方面宣告成功。
7. 每次 Verifier 回傳後，先執行
   `scripts/check-test-integrity.mjs verify --manifest ...`；任何 test file 變更都
   是角色越權，立即 `fail`。再以目前磁碟內容重跑 author-result gate（含 user
   scenarios）與 test-project gate；失敗同樣以 `fail` 結束。
8. 若 initial Verifier 的 coverage／quality／test-delivery `needs_repair` 已通過
   result gate：
   - 全 workflow 只允許一次 repair。
   - test failure 必須有 `repairEligibility.scope="test-delivery"`；不得自行改判
     `fail` 或來源不明的失敗。
   - dispatch 同一 Author，`mode: repair`，只傳 repair manifest、既有 author
     result與必要 paths。
   - 重跑 author-result、test-project gates，重新 capture Author test hashes，再
     dispatch Verifier，`isFinal: true`。若是 project-config-only build repair，
     先執行 `scripts/create-final-verifier-handoff.mjs`，只傳 handoff path，避免
     Verifier 重讀 author、initial verification 與 repair artifacts。
9. 其他結果直接結束。用 `.codex/scripts/estimate-token-usage.mjs --test-project
   <testProjectPath> --target <Target>` 產生 target estimate；缺任一 terminal
   observation 時 telemetry 標示 unavailable，不得修 artifact 或重派 agent。
   再以 `scripts/record-workflow-run.mjs finish` 記錄總耗時；
   provider 未提供 token 時保持 `providerActualTokens: unavailable`。不得恢復四角色、split Writer。

## Dispatch payload 原則

payload 只傳 paths、mode與target。使用者 scenarios 只傳 manifest path；禁止內聯
source、測試碼、完整 artifacts或主對話歷史。
所有 gate 只回傳 compact errors；gate 失敗時不得先執行昂貴的 coverage。

## 持久交付

流程後保留 `testProjectPath`、`*Tests.cs` 與必要 test-only 設定。只清理
`.orchestrator/`、`TestResults/`、`bin/`、`obj/`。不得把測試專案只留在
`.workflow/`、benchmark 或其他暫存目錄，除非使用者明確指定該 path。

## 最終摘要

```text
Target:
Test project:
Test files:
Build/Test:
Tests:
Line coverage:
Branch coverage:
Coverage decision:
Remaining uncovered:
Quality issues:
Repair used:
Warnings:
Duration:
```

100% 是預設目標。未達 100% 但只剩明確不可合理覆蓋項目時，誠實回報 `best_effort` 與原因，不得宣稱完整覆蓋。
若 decision 是 `not_suitable`，Build/Test 與 coverage 顯示 `not run / not
applicable`，並列出 Verifier 確認的原因；不得換算成 0% 或品質分數。
