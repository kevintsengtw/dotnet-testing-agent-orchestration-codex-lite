# .NET Testing Agent Orchestration for Codex Lite

只處理 .NET Unit Test 的輕量、自含 Codex workflow。它以兩個專責 subagent
降低重複 context，並用實際 build、test 與 target-scoped coverage 驗證結果。

## Workflow

```text
Lite Orchestrator
  → Lite Unit Author（分析目標並撰寫測試）
  → Lite Unit Verifier（build、test、coverage、品質檢查）
  → 有合理可補缺口時，最多一次 Author repair
  → Lite Unit Verifier final
```

## 使用方式

從已信任的 workspace root 啟動 Codex，確認 repo-local skill 可見後輸入：

```text
呼叫 $dotnet-testing-lite-orchestrator-unit。
target source: src/MyProject/PriceCalculator.cs
target class: PriceCalculator
test project: tests/MyProject.Tests/MyProject.Tests.csproj
目標是合理可測程式碼的 line/branch coverage 盡量 100%。
```

`test project` 可以指向既有 csproj，也可以是預計建立的新 path。新專案會依
solution 的 target framework、中央套件版本與 project reference 建立最小 xUnit
scaffold。

## 內建資產

- `.codex/agents/`：Lite Unit Author 與 Lite Unit Verifier。
- `.codex/skills/dotnet-testing-lite-orchestrator-unit/`：唯一 workflow 入口。
- `.codex/scripts/`：build-first runner、Cobertura parser 與結果驗證。
- `.agents/skills/`：13 個 Unit testing skills 與必要 references／templates。
- `samples/unit/practice/`：net8.0、net9.0、net10.0 空白練習矩陣。

本 repo 不需要 clone 或安裝其他 testing-skill repository。Bogus 不在 lite
workflow；AutoFixture 只在複雜 object graph 時條件式使用。

## Coverage 與品質

正式 runner 先執行 `dotnet build`，成功後才用 `dotnet test --no-build` 收集
XPlat Code Coverage。Coverage 以指定 target class 的 Cobertura line／branch
結果計算，不使用 assembly 平均值。

100% 是合理可測程式碼的預設目標，不是硬造假門檻。若剩餘路徑無法由合理
Unit Test 覆蓋，結果會保留 uncovered lines／branches 與原因。Coverage 與品質
共用一次 repair 額度，避免反覆嘗試造成無上限成本。

## 文件

- [架構](docs/architecture.md)
- [使用方式](docs/usage.md)
- [版本紀錄](CHANGELOG.md)

## 開發來源

此 public repo 是由 private lite lab 的發布白名單自動產生的 consumer snapshot。
版本 tag 與 GitHub Release 均指向同步後的 public commit。
