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
`.orchestrator/` 內的 author／project validation／coverage／run JSON，以及
`TestResults/`、`bin/`、`obj/` 是 run artifacts，可不進版控。run JSON 記錄
整體耗時；token 只有 provider 實際值或明確標示的 visible-text estimate，
兩者不得混稱。

未達100%時，查看：

- `uncoveredLines`
- `uncoveredBranches`
- verifier的 `repairable` / `uncoverable`

workflow 對 coverage 與 quality 共用一次 repair 額度，避免 token 無上限成長。

Author result 的 `scenarioPlan` 會保留每個 scenario 的 ID、category、priority、名稱、預期行為、覆蓋規則、oracle、需求來源、implementation-detail 判斷與 test method。類別至少區分 happy、boundary、exception、branch、state、characterization；沒有適用情境時可不建立空泛測試，但需由分析明確排除。

初次撰寫還必須附上 `completenessAudit`，逐項覆核 public behaviors、defaults、boundaries、branches、rule precedence、state/side effects 與 implementation details。Verifier 會先以 deterministic gate 驗證此 artifact；任何缺項或未解項目都會使品質判定失敗，即使 coverage 已達 100% 也不例外。

Author 完成後會先以 MSBuild evaluated model 驗證測試 csproj、target
`ProjectReference`、實際編譯的 test files、必要 xUnit/Coverlet 套件與 target
framework。任一項失敗時不會浪費 token 執行 Verifier。production source 會在
Author 前建立 hash baseline，並在 build/test 後驗證未被修改。

Scenario 只收錄 target public API 能直接保證的行為；跨 application、
repository 或 infrastructure 才能成立的需求記在
`excludedResponsibilities`。Oracle 必須能讓對應錯誤實作失敗，例如「唯一」
要比較兩次結果，「不改變」要比較 before/after。

Author-result gate 會直接解析 `testFilePaths` 內的 `[Fact]`／`[Theory]`，
scenario mapping、宣告數量與實際 C# 方法必須一致。完整 exception message
只有公開契約明載時才能鎖定；複雜 mapping 應以獨立 Arrange 期望值逐欄驗證，
不可只讓多個實際輸出互相比對。

## 套件與命名

- 新建 test project 時預設考慮 AwesomeAssertions；有 interface dependency 時加入 NSubstitute。
- TimeProvider、System.IO.Abstractions、FluentValidation 與 AutoFixture 只依 source seam 加入。
- 既有 test project 的套件版本保持不變，不為風格偏好升降。
- 不使用 Bogus。
- 新測試類別必須為 `<Sut>Tests`，方法必須為 `Method_情境_應結果`。
