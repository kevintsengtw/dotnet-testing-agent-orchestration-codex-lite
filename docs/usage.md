# Usage

## 必要資訊

- target `.cs` path
- target class name
- test `.csproj` path（可為既有 csproj，或預計建立的新 path）

## Prompt

Codex Lite 專屬入口位於
`.codex/skills/dotnet-testing-lite-orchestrator-unit/SKILL.md`。

```text
呼叫 $dotnet-testing-lite-orchestrator-unit。
target source: src/MyProject/PriceCalculator.cs
target class: PriceCalculator
test project: tests/MyProject.Tests/MyProject.Tests.csproj
目標是合理可測程式碼的 line/branch coverage 盡量 100%。
```

可直接附上 scenarios與資料；Author會逐項保留、拒絕或標記限制。

若 test csproj 尚不存在，Lite Orchestrator 會以 `testProjectMode=create`
交給 Lite Unit Author。Lite Unit Author 必須建立可直接 `dotnet test` 的最小專案，遵守 repo
既有 target framework、中央套件版本與 project reference；不需要使用者先建立
空白 csproj。

## 結果

指定 test project 內的 csproj 與 `*Tests.cs` 是主要交付成果，流程結束後保留。
每次執行使用獨立的 `.orchestrator/runs/<run-id>/<target>/`；其中的
author／project validation／coverage／run JSON、`result.json` 與 `result.md`，以及
`TestResults/`、`bin/`、`obj/` 是 run artifacts，可不進版控。run JSON 記錄
整體耗時；token 只有provider實際值或明確標示的申報檔案完整內容上限估算。局部
讀取仍可能高估，不能與實際visible tokens或billing usage混稱。

未達100%時，查看：

- `uncoveredLines`
- `uncoveredBranches`
- verifier的 `repairable` / `uncoverable`

每個 `uncoverable` 都必須附上從公開行為無法控制或觀察該缺口的證據；可由公開
輸入重現且有重要價值的缺口列為 `repairable`。

workflow 對 coverage 與 quality 共用一次 repair 額度，避免 token 無上限成長。

最終結果把 lifecycle、decision 與 stop reason 分開。`blocked` 表示整個 target
確實缺少可用 production seam；環境寫入保護或 collector／CLI 事故分別以
`environment_protection`、`tool_incident` 停止，不會冒充產品 blocker 或 test failure。
環境保護停止時，由 deterministic runtime 保留受阻路徑、操作與錯誤證據。

Author result 的 `scenarioPlan` 保留可否證的預期行為、oracle、failure mode 與實際test method。
Scenario數量、分類方式及品質措辭不是machine gate；repair只交付有限delta，不重送完整initial
scenario mapping。

Author 完成後會先以 MSBuild evaluated model 驗證測試 csproj、target
`ProjectReference`、實際編譯的 test files、必要 xUnit/Coverlet 套件與 target
framework。任一項失敗時不會浪費 token 執行 Verifier。production source 會在
Author 前建立 hash baseline，並在 build/test 後驗證未被修改。

Scenario 只收錄 target public API 能直接保證的行為；跨 application、
repository 或 infrastructure 才能成立的需求記在
`excludedResponsibilities`。Oracle 必須能讓對應錯誤實作失敗，例如「唯一」
要比較兩次結果，「不改變」要比較 before/after。

Author-result gate 會直接解析 `testFilePaths` 內的 `[Fact]`／`[Theory]`，確認initial scenario
能追溯實際C#方法；build、test與project counts只讀runner evidence，不與Author自報數字比較。完整exception message
只有公開契約明載時才能鎖定；複雜 mapping 應以獨立 Arrange 期望值逐欄驗證，
不可只讓多個實際輸出互相比對。

## 套件與命名

- 新建 test project 時預設考慮 AwesomeAssertions；有 interface dependency 時加入 NSubstitute。
- TimeProvider、System.IO.Abstractions、FluentValidation 與 AutoFixture 只依 source seam 加入。
- 既有 test project 的套件版本保持不變，不為風格偏好升降。
- 不使用 Bogus。
- 新測試類別必須為 `<Sut>Tests`，方法必須為 `Method_情境_應結果`。
