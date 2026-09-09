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

## 直接執行 coverage runner

在已部署 `.codex/` 與 `.codex/skills/` 的專案根目錄，依
`dotnet-test-lite` Skill 執行 `.codex/scripts/dotnet-testing-lite/run-coverage.mjs`。
五個 workflow 參數為 `--test-project`、`--target-source`、`--target-class`、
`--output` 與 `--production-baseline`。Baseline 必須先由 production integrity gate
的 `capture --target-source <source.cs> --output <baseline.json>` 建立；gate 位於
`.codex/scripts/dotnet-testing-lite/gates/check-production-integrity.mjs`。
每次使用新的 output 路徑，runner 會保留 TRX、Cobertura 與 production integrity 結果。

v1.1.1 修正了 v1.1.0 Skill 的入口參照。升級須更新完整 Lite 部署資產；
固定 archive 的下游整合應等待新的 stable Release，記錄新 exact commit 與
該 archive 的 SHA-256。既有 v1.1.0 tag 保持不變。

## 結果

指定 test project 內的 csproj 與 `*Tests.cs` 是主要交付成果，流程結束後保留。
每次執行使用獨立的 `.orchestrator/runs/<run-id>/<target>/`；其中的
author／project validation／coverage／run JSON、`result.json` 與 `result.md`，以及
`TestResults/`、`bin/`、`obj/` 是 run artifacts，可不進版控。run JSON 記錄
整體耗時。Driver 的 machine result 不包含 token 估算或用量數字；支援的 Codex runtime
會另行自動觀測本回合用量，並在最終 Markdown 附上結果網頁網址。

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

## 用量網頁與 credit 試算

1. 照一般方式執行 Lite workflow，從最終報告複製本機用量網頁網址，貼到瀏覽器開啟。這個網址是本機結果，不是已上傳的公開頁面。
2. 等待頁面顯示回合完成及用量觀測一致，再查看主代理、各子代理與整個 workflow 合計。總 tokens 包含快取；推理用量已包含在輸出，不重複加總。
3. 展開「選用：依 Standard 官方費率換算 credit」，查看 runtime 記錄的模型、推理強度與服務模式，再按「按 Standard 模式換算」。頁面會顯示各代理的公式與 workflow 合計。

Credit 使用網頁標示查核日期的費率版本；它是參考試算，不代表帳戶實際扣抵。服務模式缺漏時按 Standard 前提試算並明示缺漏，不把未知模式當成已確認；資料不足或未完成時不提供完整 credit 合計。

2026-09-08 Windows CLI 驗收的既有完成結果如下，並非重新執行或示意數據：

| 代理 | 未快取輸入 | 快取輸入 | 輸出 | 總 tokens（含快取） | 請求數 |
|---|---:|---:|---:|---:|---:|
| 主代理 | 37,858 | 535,040 | 4,493 | 577,391 | 19 |
| Author | 50,256 | 632,832 | 7,687 | 690,775 | 17 |
| Verifier | 28,036 | 468,608 | 4,212 | 500,856 | 14 |
| 整個 workflow | 116,150 | 1,636,480 | 16,392 | 1,769,022 | 50 |

這批三個代理的模型均為 `gpt-5.6-sol`、推理強度 `medium`，服務模式未記錄。依該網頁保存的 2026-09-07 費率版本（每百萬未快取輸入／快取輸入／輸出為 100／10／500 credits），Standard 前提試算合計為 **36.1758 credits**，與使用者提供的結果截圖一致；這不是帳戶實際扣抵，也不是目前費率的重新查核。截取或分享結果時應保留上述換算前提。網頁與測試證據會隨 run 保留；清除 run 後原網址失效，保存與清理方式見下節。

## Codex workflow 用量

![用量網頁完整截圖，包含代理用量與 Standard 前提 credit 試算](images/workflow-usage-credit.png)

上圖為上述 Windows CLI 驗收的實際頁面，已展開 credit 區並執行試算；圖片可點開查看原始尺寸。

Codex CLI／Extension 的一般 Lite workflow 提示詞會由 driver 自動啟動用量背景觀測；不需另跑
驗收 PS1。回合完成後會更新 `runRoot/usage/result.html`，最終報告提供可複製的網址，
提供主代理與子代理的用量及選用 Standard credit 試算，不需 `/exit`。
目前限一個主代理回合內的一個 workflow。不自動開啟瀏覽器。
Windows 的 CLI 與 Extension 已使用明確指定 Lite skill 的提示詞，完成最新部署的實際用量收集及網址交付驗收；Runtime 提交 `82f3dd3` 的遠端三平台 CI 已通過。
條件、停用方式與失敗處理見 [Codex 自動用量說明](../.codex/scripts/dotnet-testing-lite/usage/README.md)。

每次執行會新增獨立 run 目錄，用量與測試證據不會自動清除。跨平台清理工具預設只預覽；
加上 `--apply` 才刪除可確認已完成且用量 observer 已收尾的 run：

```text
node .codex/scripts/dotnet-testing-lite/usage/cleanup.mjs --test-project <test-project.csproj> --older-than-days 30 --keep 10
node .codex/scripts/dotnet-testing-lite/usage/cleanup.mjs --test-project <test-project.csproj> --older-than-days 30 --keep 10 --apply
```

亦可改用 `--run-id <run-id>` 指定一次執行，或用 `--all-completed` 選取所有已完成 run。
完整安全條件與其他範例見上述自動用量說明。

## 套件與命名

- 新建 test project 時預設考慮 AwesomeAssertions；有 interface dependency 時加入 NSubstitute。
- TimeProvider、System.IO.Abstractions、FluentValidation 與 AutoFixture 只依 source seam 加入。
- 既有 test project 的套件版本保持不變，不為風格偏好升降。
- 不使用 Bogus。
- 新測試類別必須為 `<Sut>Tests`，方法必須為 `Method_情境_應結果`。

## 獨立安裝、更新與移除

Runtime、兩個 Lite agents、orchestrator 與 13 個 `-lite` 技能為完整安裝單位。
在已解壓且保留的 Lite 發布快照目錄執行下列命令；workspace 指向另一個實際專案。
部署工具只需要 Node.js 20.11+。預覽不寫檔；`--apply` 套用。

```text
node .codex/scripts/dotnet-testing-lite/deploy.mjs --workspace "../My Project"
node .codex/scripts/dotnet-testing-lite/deploy.mjs --workspace "../My Project" --apply
node .codex/scripts/dotnet-testing-lite/deploy.mjs --workspace "../My Project" --remove
node .codex/scripts/dotnet-testing-lite/deploy.mjs --workspace "../My Project" --remove --apply
```

更新時由新的完整快照執行相同 install 命令。receipt 保存於工作區
`.codex/dotnet-testing-lite-install.json`，以 SHA-256 辨識安裝檔；已修改或外來檔案不覆寫。
移除保留修改過的檔案與外來檔案，空目錄可留下；輸出 `preserved` 列出已知未刪項。
舊版 `.codex/scripts/lite-unit/` 僅依 b1ba4ac 基準雜湊（正規化 CRLF）刪除相符檔案。
原共用 `.agents/skills/` 不屬新安裝器可安全辨識的唯一擁有範圍，因此不自動刪除。

README、CHANGELOG、samples 與共用 `.codex/config.toml` 不疊加覆寫或移除。
新工作區可使用快照的設定範本；既有設定請在既有同名 table 合併以下鍵，不能重複 table。
已存在的使用者鍵與其他工具設定須保留；若既有上限較高可沿用，不為 Lite 降低。

```toml
[features]
multi_agent = true

[agents]
enabled = true
max_depth = 1
max_threads = 6
job_max_runtime_seconds = 1800
```

Full 更新／移除需遵守其自有檔案邊界；整棵刪除共用 `.codex` 或覆寫設定不在隔離保證內。
Extension 的外部安裝器也必須採用 Lite 白名單與此設定合併契約；外部整合尚待下游配合。
Lab 的 `sync-public.mjs` 用於專用 public checkout，會整理受管目錄，不是 consumer 安裝命令。

## 保存與復原範圍

每次 run 增加資料，預設不自動刪除；HTML 是內嵌資料快照。Cleanup 刪除整個 run，
包括用量與測試證據，舊網址會失效且不經資源回收筒；重要證據請先備份。
不刪除 Codex sessions／SQLite、測試原始碼、csproj 或專案 bin／obj。
Cleanup 與復原只需要 Node.js；Python 3.8+ sqlite3 僅供 observer 收集用量。
異常中斷、含空白路徑及三平台命令見 [保存與清理](../.codex/scripts/dotnet-testing-lite/usage/README.md#保存與清理)。

用量索引固定跟隨已部署工作區：`.orchestrator/dotnet-testing-lite/usage-turns/`；不建立全域索引。run cleanup 會同步預覽對應索引，套用時只移除本次成功刪除 run 的索引。仍有 run、正在寫入或刪除失敗的索引會保留；不在 workflow 啟動前清空 `.orchestrator`。若曾手動移除 run 或索引清理失敗，可執行 `node .codex/scripts/dotnet-testing-lite/usage/workspace-index.mjs` 預覽孤立索引，加 `--apply` 才移除。索引清理失敗會單獨列在 `indexCleanup.failures`，命令回傳非零；已刪除的 run 不會復原。清理工具只需要 Node.js，不需要 Python／SQLite。


## Workflow 用量資料的留存與清除

**預設留存，由使用者明確清除。開始下一次 workflow 不會刪除前一次結果，也沒有自動到期清理。**
每次執行新增資料；`.gitignore` 只避免簽入，不會釋放磁碟空間。

| 資料 | 位置 |
|---|---|
| 用量網頁、JSON、TRX、coverage 與執行證據 | 測試專案目錄下 `.orchestrator/runs/<run-id>/<target>/` |
| 用量防重複索引 | 已部署工作區根目錄下 `.orchestrator/dotnet-testing-lite/usage-turns/` |

在已安裝 Lite 的工作區根目錄執行。以下以隨附 net10 練習專案為例；其他專案請替換引號內的 `.csproj` 路徑。
Windows PowerShell、macOS 與 Linux 使用相同命令，清除只需要 Node.js 20.11+；Python／SQLite 是用量收集的相依，不是清除的前提。

先預覽此測試專案全部可清除的已完成 run 與對應索引：

```text
node .codex/scripts/dotnet-testing-lite/usage/cleanup.mjs --test-project "samples/unit/practice/tests/Practice.Core.Net10.Tests/Practice.Core.Net10.Tests.csproj" --all-completed
```

確認清單並備份需要的證據後，加上 `--apply` 才會實際刪除：

```text
node .codex/scripts/dotnet-testing-lite/usage/cleanup.mjs --test-project "samples/unit/practice/tests/Practice.Core.Net10.Tests/Practice.Core.Net10.Tests.csproj" --all-completed --apply
```

**刪除單位是整個 run，不是只有用量網頁。** HTML、JSON、TRX、coverage 與該 run 的其他證據一併刪除，
原網頁網址失效，不經資源回收筒；本次成功刪除 run 的索引同步移除。
測試原始碼、`.csproj`、`bin/obj` 與 Codex 使用者目錄的 sessions／SQLite 不會被刪除。
正在執行、observer 尚未收尾或狀態無法確認的 run 會保留；不要直接整棵刪除 `.orchestrator`。

輸出 `selected` 與 `indexCleanup.selected` 是預覽範圍；`removed` 與 `indexCleanup.removed` 是實際刪除結果。
`skipped` 列出跳過原因；`failures` 非空時命令回傳非零，可能已有部分 run 刪除成功。
指定單次 run、保存天數及保留最近 N 次的命令，見[完整清理說明](../.codex/scripts/dotnet-testing-lite/usage/README.md#保存與清理)。

## 建置失敗後的受控重跑

標準 runner 預設拒絕既有輸出。只有本次原始結果為 `build_failed`、tests 尚未執行、production integrity 通過，且目標、測試專案、baseline 路徑與 coverage 門檻相同時，才可在原 runner 命令加上 `--retry-build-failed`。
若失敗涉及宿主權限，須先依宿主規則取得核准；旗標本身不授予權限，不可用來繞過拒絕。

Runner 在 `<output>.attempts/<識別碼>/failed.json` 保存前次失敗 base，若有 summary 也會一併保存並核對內容；新結果以 `previousAttemptPath` 連回前次證據。不需也不得由代理先刪除失敗 base。
成功結果、已有 raw 證據、已合併 review 或存在 supplement 的輸出均拒絕重跑。輸出鎖避免並行覆寫；異常中止留下鎖時不會自動假定程序已停止。
這些 attempts 若位於 run 內，會隨整個 run 一起保留或由明確 cleanup 清除；不新增自動清除前次 workflow 的行為。

## 用量失敗與工作區權限

用量收集若在建立回合索引或啟動 observer 時失敗，正式報告會明示沒有可用統計；若診斷 HTML 已建立，也會提供診斷網址。診斷頁不代表已收集到用量，不能用來判定帳戶扣抵。資料仍依預設留存、明確清除政策處理。

建置工具寫入受測專案或測試專案的標準 `bin`／`obj` 目錄遭拒時，流程可記錄為環境停止；這不授權修改 production 原始碼，也不把未完成的建置／測試判定為通過。

測試專案的 `.orchestrator/active-run.json` 是流程啟動鎖；工作區根目錄的 `.orchestrator/dotnet-testing-lite/usage-turns/` 才是用量索引，兩者不要混為一談。若重複使用舊工作區時遇到 `EPERM`，Git 乾淨不代表舊目錄的寫入權限也正常；先保留證據，在同一宿主核對失敗路徑。不要直接清空整棵 `.orchestrator`，也不要把停用 sandbox 當成預設解法。
