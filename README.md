# .NET Testing Agent Orchestration for Codex Lite

在 Codex CLI 或 VS Code Extension 中，為 .NET 類別或單一方法建立並驗證 xUnit 單元測試。
Author 負責測試設計與撰寫，Verifier 獨立執行 build、test、目標覆蓋率與品質審查。
Production 程式碼保持唯讀；需要補測時，最多進行一輪修正與最終驗證。

本 repo 包含完整 Lite runtime、兩個專責 agent、所需 skills，以及 .NET 8／9／10
空白測試練習專案。安裝與執行方式見下方說明。

## v1.2.4 更新摘要

- **更清楚的還原診斷**：NuGet 預檢無法完成或還原失敗時，最後回覆直接列出專案、狀態、
  可取得的退出碼與關鍵原始錯誤，缺漏與裁切如實標示。
- **交接與交付檢查**：交接紀錄綁定本次 run 與代理；Author 交付前檢查情境與實際測試
  方法的對應，避免把測試替身的輔助方法誤列為測試。Driver 保留獨立契約檢查。
- **可追溯的測試摘要**：保留使用者情境原文、明確的情境分類，以及修正前計畫與最終
  測試數的統計範圍。已確認 run 的交接失敗會留下失敗報告與可取得的證據。
- **Terra credit 換算**：用量網頁新增 gpt-6.1-terra 的保存費率，列出各代理與合計試算；
  服務模式缺漏時明示 Standard 前提，未知模型不套用其他模型費率。

修改後已完成本機 Node 316／316、三個 .NET 版本 smoke 各 22／22，以及 Extension／
Windows Terminal CLI 人工對照。三代理 gpt-6.1-terra／xhigh 的六次流程均通過，
包含兩入口的 repair／final 與 credit 換算。完整變更、驗證範圍與已知限制見
[CHANGELOG](CHANGELOG.md#v124---2026-10-29)。

## Workflow

```text
Lite Orchestrator
  → 目前 Codex 沙箱的 NuGet 還原預檢
  → deterministic driver（run identity、gates、terminal state）
  → Lite Unit Author（分析目標並撰寫測試）
  → Lite Unit Verifier（build、test、coverage、品質檢查）
  → 有合理可補缺口時，最多一次 Author repair → Lite Unit Verifier final
```

### Lite agent 預設模型

| Agent 設定 | 預設模型 | 推理強度 |
| --- | --- | --- |
| `.codex/agents/dotnet-testing-lite-unit-author.toml` | GPT-6 Sol（`gpt-6-sol`） | `medium` |
| `.codex/agents/dotnet-testing-lite-unit-verifier.toml` | GPT-6 Sol（`gpt-6-sol`） | `medium` |

這兩個 TOML 只指定 Author／Verifier 的預設值；主對話模型在 Codex 入口選擇。
v1.2.4 的 Terra／Luna 驗收配置不會改寫部署預設值。需要採用其他模型時，調整對應
TOML 的 `model` 與 `model_reasoning_effort`，並在主對話選用相同設定。
本版 gpt-5.6-luna、gpt-6-luna 驗收均使用 `max`；用量網頁保留實際 runtime 記錄。

## 使用方式

Windows CLI 使用 **Windows Terminal 與 PowerShell 7**，確認分頁設定檔為 `pwsh.exe`。
安裝 Windows Terminal 不會同時升級 PowerShell。找不到 `codex` 時，確認既有 CLI 的
執行檔位置；若出現共用背景服務設定不相容，可選 `Run without daemon this time`。
本機曾在 VS Code 內建終端機遇到程序建立錯誤，原因尚未確認；相關條件與操作見
[Windows CLI 執行環境說明](docs/usage.md#v124-r1-本機驗收2026-10-27)。

從已信任的 workspace root 啟動 Codex，或以 CLI 的 `-C <workspace-root>` 明確指定目錄；
確認 repo-local skill 可見後輸入：

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

只測試單一方法時，在提示詞加上 `target method: <方法名稱>`；coverage 只計算該方法。
多載或編譯器產物無法唯一識別時會回報限制，不以整類覆蓋率代替。多目標逐一完成後，
最後回覆保留全部目標的完整報告，包含失敗結果。

Orchestrator 在建立 run 前，先於目前 Codex 沙箱對既有 test project 執行 NuGet 還原預檢；
若 test project 尚未建立，改預檢 target 對應的來源專案。預檢回傳 `ready`，或因執行環境
限制無法完成而回傳 `skipped`，都可啟動 driver 與派遣具名 Author、Verifier。
若工具層已拒絕執行預檢，則保留工具錯誤並略過，不要求先修好預檢；略過不代表還原成功，
後續實際建置、測試與完整性檢查仍必須通過。一般啟動不需要設定 `NUGET_PACKAGES` 或為 NuGet 修改
`.codex/config.toml`；未設定時沿用 `NuGet.Config` 與預設快取，明確設定時才檢查並使用
指定快取。輸入／設定不合法，或已執行的還原明確失敗時，仍回報 `blocked` 並停止；
保留診斷，依錯誤檢查套件來源、快取或存取問題。
只有確認所需套件位於另一個可讀快取、且目前環境未使用時，才考慮選用 CLI override。
指令與限制見[使用說明](docs/usage.md#prompt)。

每次 workflow 的測試與用量證據會保存在 test project 的 `.orchestrator/runs/`，不會自動清除。
Windows、macOS 與 Linux 可使用相同的 Node.js CLI 預覽並清理已完成 run；未加 `--apply`
不會刪除：

```text
node .codex/scripts/dotnet-testing-codex-lite/usage/cleanup.mjs --test-project <test-project.csproj> --older-than-days 30 --keep 10
node .codex/scripts/dotnet-testing-codex-lite/usage/cleanup.mjs --test-project <test-project.csproj> --older-than-days 30 --keep 10 --apply
```

工具不會刪除 active、仍在執行、狀態無法確認或用量 observer 尚未收尾的 run。

## 用量網頁與 credit 試算

Workflow 最後回覆會附上本機 HTML 網址，顯示主代理與子代理的未快取輸入、快取輸入、
輸出、總 tokens 與請求數。背景觀測會在主代理回合完成後收尾；若頁面仍顯示等待，
稍後重新整理即可，不需要退出 Codex 或另外執行收集命令。

同一主代理回合的多個 workflow 共用一筆用量，不能跨報告相加，也不能拆成各目標的
獨立用量；各 workflow 的測試判定仍分別顯示。推理用量已包含於輸出，不重複加總。

展開「選用：依 Standard 官方費率換算 credit」，再按「按 Standard 模式換算」，
即可查看各代理與合計試算。頁面列出實際模型、推理強度、服務模式、保存費率及公式。
v1.2.4 收錄 gpt-6.1-terra 的費率為每百萬未快取輸入／快取／輸出 **25／1.25／125 credits**，
查核日期為 2026-10-29；推理強度不另乘倍率。

**這是保存費率的參考試算，不是帳戶實際扣款。** 服務模式缺漏時明示 Standard 前提；
未知模型不套用其他模型費率，資訊不足時不產生合計。既有歷史 HTML 保留原始資料。
操作與計費範圍見 [使用說明](docs/usage.md#用量網頁與-credit-試算)。

![歷史 Windows CLI 用量網頁：各代理用量與 Standard 前提 credit 試算](docs/images/workflow-usage-credit.png)

圖為 2026-09-08 的歷史驗收，使用當時的 GPT-5.6 Sol 配置；現行頁面另包含 Terra 費率。

## 內建資產

- `.codex/agents/`：Lite Unit Author 與 Lite Unit Verifier。
- `.codex/skills/dotnet-testing-lite-orchestrator-unit/`：唯一 workflow 入口。
- `.codex/scripts/dotnet-testing-codex-lite/`：唯一 workflow driver、deterministic gates、artifact helpers、
  build-first runner、Cobertura parser 與結果驗證。
- `.codex/skills/*-lite/`：13 個獨立 Unit testing skills 與必要 references／templates。
- `samples/unit/practice/`：net8.0、net9.0、net10.0 空白練習矩陣。

本 repo 不需要 clone 或安裝其他 testing-skill repository。Bogus 不在 lite
workflow；AutoFixture 只在複雜 object graph 時條件式使用。

13 個 Unit skills 都是可選技術來源，不是固定 routing 或必載清單。Agent 只有在
具體技術疑問無法由 source、project、gates 與實測證據解決時，才選讀最少相關來源。

本 workflow 可與外部 `.codex/skills/dotnet-test` 安裝在同一個 workspace，
再依情境選用。Lite 的入口與內部 helper 全部集中於
`.codex/scripts/dotnet-testing-codex-lite/`，避免覆寫外部 skill。
安裝時必須合併 workspace 的 `.codex/config.toml`，不可用任一 repo 的完整設定檔
覆寫另一份；README、CHANGELOG 與 samples 也不屬於疊加安裝資產。

## 獨立部署與升級

升級至 v1.2.4 時，更新完整 Lite 部署單位：兩個 `.codex/agents/dotnet-testing-lite-unit-*.toml`、
Orchestrator skill、13 個 Unit skills，以及 `.codex/scripts/dotnet-testing-codex-lite/`。
本次同時調整 Author、Orchestrator、Driver、報告與用量網頁，只替換預檢腳本會缺少其他修正。

部署範圍為工作區；合併既有 `.codex/config.toml` 的必要欄位，保留自己的模型、套件與環境
設定。原有明確代理 ID 交接介面仍可使用；預檢結果相容新增 `diagnosticSummary`，
既有狀態與退出碼欄位保留。Author／Verifier 預設仍為 gpt-6-sol／medium。

既有 `.orchestrator/runs/` 與歷史用量 HTML 保留，不以新版費率回寫舊報告。
舊 runtime 只清除能以基準雜湊辨識的檔案；外來檔案與外部 skills 保留。
完整步驟見 [安裝、更新與移除](docs/usage.md#獨立安裝更新與移除)。

Windows 子程序輸出上限仍在程序結束後檢查；不限制執行期間磁碟增長，原有 timeout
設定保留。已知限制與暫存清理見 [使用說明](docs/usage.md#windows-子程序擷取與限制)。

Public 快照只包含發布白名單資產；Lab 開發腳本、原始驗收資料、生成測試及 build/run
產物不在其中。發布流程會下載 GitHub 的 ZIP 與 tar.gz，逐份驗證資產邊界並記錄 SHA-256。

## 歷史：v1.1.0 workflow 重整

v1.1.0因應`dotnet-testing-agent-skills v2.4.2`，把模型責任收斂為測試語意工作，並將
workflow state、machine truth、integrity、artifact、timing與繁中final交由
deterministic driver維護；本次將其移至 `.codex/scripts/dotnet-testing-codex-lite/`。

- Orchestrator只啟動driver、依action調度固定Author→Verifier拓樸，並逐字交付final。
- Author只建立高價值xUnit Unit Tests、處理test-only問題與唯一一次有限repair。
- Verifier對production與test delivery唯讀，獨立驗證build、test、target-scoped coverage及
  重要可測缺口。
- No-test、blocked、not-suitable與environment protection均有獨立machine state，不以測試數量、
  scenario拆分、skill選擇或低嚴重度措辭差異判定失敗。

Repository tests為125/125通過；public snapshot固定為179個檔案、2個Lite agents與13個Unit
skills。Final candidate的影響導向live批次為3/3 `hard-pass`，且production mutation為0。

## 歷史：v1.0.0 Lite script 命名空間驗證

v1.0.0 將 Lite runtime 的入口統一為 `lite-` 前綴，helper 移至
`.codex/scripts/dotnet-testing-codex-lite/`，讓 Lite 與原版 workflow 可以共存。這次只調整 runtime
路徑與引用，沒有改變 workflow topology、repair 額度、coverage 規則或品質門檻。

改名後以 GPT-5.6 Luna／max 的 Lite Author、Verifier 重新執行固定 10-run matrix；
outer coordinator 固定為 GPT-5.6 Sol／medium：

| 驗證項目 | 結果 |
| --- | ---: |
| Outer runs | 10/10 完成 |
| Target executions | 12/12 完成 |
| Terminal decision | 8 pass、4 best_effort |
| Quality gate | 12/12 pass |
| 使用 repair | 6/12 targets |
| Aggregate raw input + output | 15,834,891 tokens |
| Workflow duration 合計 | 8,833,270 ms（約 2:27:13） |
| Production source mutation | 0 |

這批歷史 run 使用當時的 Lite 專屬 runtime。現行 runtime 已集中在
`.codex/scripts/dotnet-testing-codex-lite/`，不再散置於 `.codex/scripts/` 與根目錄 `scripts/`。
Token telemetry 混合 outer 與 Lite agents，不能視為 Luna 單一模型的實際用量或
provider 帳單。Public release 保留這份驗證摘要；raw `.workflow`、controller、
incident 與 run workspace 不在發布範圍內。

## Coverage 與品質

正式 runner 先執行 `dotnet build`，成功後才用 `dotnet test --no-build` 收集
XPlat Code Coverage。Coverage 以指定 target class 的 Cobertura line／branch
結果計算，不使用 assembly 平均值。

100% 是合理可測程式碼的預設目標，不是硬造假門檻。若剩餘路徑無法由合理
Unit Test 覆蓋，結果會保留 uncovered lines／branches 與原因。Coverage 與品質
共用一次 repair 額度，避免反覆嘗試造成無上限成本。

## 歷史：30-run 模型實驗

以下保留當時實驗採用的 Standard／short-context API 美元費率與 ChatGPT Codex Credit rate，
單位皆為每 1M tokens；順序為 uncached input／cached input／output。

| 模型與強度 | API 費率 | Codex Credit 費率 |
| --- | ---: | ---: |
| GPT-5.5 medium | $5／$0.50／$30 | 125／12.5／750 credits |
| GPT-5.6 Sol medium | $5／$0.50／$30 | 125／12.5／750 credits |
| GPT-5.6 Terra max | $2／$0.20／$12 | 50／5／300 credits |
| GPT-5.6 Luna max | $0.20／$0.02／$1.20 | 5／0.5／30 credits |

> **GPT-5.6 Sol 與 GPT-5.5 的單位費率相同。** Reasoning effort 不改變
> 單位費率，但會影響實際 token 用量、耗時與總成本。

實驗在同一份 source、10-run matrix、workflow topology、prompt、skills、scripts、
repair 規則與品質門檻下，比較三組 Lite Author／Verifier；每組各 10 runs，共
30 runs／36 target executions。三組 outer coordinator 都固定為 GPT-5.6 Sol
medium，因此 Sol 不是第四組 Lite candidate。這些是歷史固定配置的實驗結果，
不代表目前兩個 Lite agent 的預設 model tuple。

| Lite 配置 | Raw tokens | Workflow span | Quality pass | Repair targets | API 成本估算 | Credits 估算 | 占 400 credits |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| GPT-5.5 medium | 15,224,236 | 7,624.281 秒 | 12/12 | 2 | $14.249731 | 356.243275 | 89.06% |
| GPT-5.6 Luna max | 19,474,169 | 10,223.138 秒 | 11/12 | 5 | $0.702770 | 17.569258 | 4.39% |
| GPT-5.6 Terra max | 19,910,275 | 13,887.696 秒 | 8/12 | 6 | $7.089931 | 177.248280 | 44.31% |

成本是把每格 aggregate runtime usage 全部套用該組 Lite model 費率的容量規劃
估算。Telemetry 混合 outer Sol 與 Lite agents，沒有 per-model breakdown，因此
不是 provider 帳單或企業後台實際扣款；reasoning output 已包含於 output，不重複
計價。Workflow span 來自 run manifests，也不是 outer end-to-end wall-clock time。

若只把既有三組 aggregate tokens 全部套用 Sol medium 費率，估算分別為
356.243275、439.231450、443.120700 credits。這是費率敏感度分析，不是 Sol
medium 的獨立 10-run token、品質或耗時實測。

完整紀錄：

- [實驗結案報告](docs/benchmarks/gpt55-medium-vs-gpt56-luna-terra-max/closing-report.md)
- [逐格與聚合技術摘要](docs/benchmarks/gpt55-medium-vs-gpt56-luna-terra-max/summary.md)
- [Machine-readable 30-run 結果](docs/benchmarks/gpt55-medium-vs-gpt56-luna-terra-max/result.json)
- [OpenAI API Pricing](https://developers.openai.com/api/docs/pricing)
- [Codex Pricing 與 Credit rate card](https://learn.chatgpt.com/docs/pricing)

## 文件

- [架構](docs/architecture.md)
- [使用方式](docs/usage.md)
- [版本紀錄](CHANGELOG.md)

## 開發來源

此 public repo 是由 private lite lab 的發布白名單自動產生的 consumer snapshot。
版本 tag 與 GitHub Release 均指向同步後的 public commit。


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
node .codex/scripts/dotnet-testing-codex-lite/usage/cleanup.mjs --test-project "samples/unit/practice/tests/Practice.Core.Net10.Tests/Practice.Core.Net10.Tests.csproj" --all-completed
```

確認清單並備份需要的證據後，加上 `--apply` 才會實際刪除：

```text
node .codex/scripts/dotnet-testing-codex-lite/usage/cleanup.mjs --test-project "samples/unit/practice/tests/Practice.Core.Net10.Tests/Practice.Core.Net10.Tests.csproj" --all-completed --apply
```

**刪除單位是整個 run，不是只有用量網頁。** HTML、JSON、TRX、coverage 與該 run 的其他證據一併刪除，
原網頁網址失效，不經資源回收筒；本次成功刪除 run 的索引同步移除。
測試原始碼、`.csproj`、`bin/obj` 與 Codex 使用者目錄的 sessions／SQLite 不會被刪除。
正在執行、observer 尚未收尾或狀態無法確認的 run 會保留；不要直接整棵刪除 `.orchestrator`。

輸出 `selected` 與 `indexCleanup.selected` 是預覽範圍；`removed` 與 `indexCleanup.removed` 是實際刪除結果。
`skipped` 列出跳過原因；`failures` 非空時命令回傳非零，可能已有部分 run 刪除成功。
指定單次 run、保存天數及保留最近 N 次的命令，見[完整清理說明](.codex/scripts/dotnet-testing-codex-lite/usage/README.md#保存與清理)。
