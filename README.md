# .NET Testing Agent Orchestration for Codex Lite

只處理 .NET Unit Test 的輕量、自含 Codex workflow。它以兩個專責 subagent
降低重複 context，並用實際 build、test 與 target-scoped coverage 驗證結果。

## Workflow

```text
Lite Orchestrator
  → deterministic driver（run identity、gates、terminal state）
  → Lite Unit Author（分析目標並撰寫測試）
  → Lite Unit Verifier（build、test、coverage、品質檢查）
  → 有合理可補缺口時，最多一次 Author repair → Lite Unit Verifier final
```

### Lite agent 預設模型

| Agent 設定 | 預設模型 | 推理強度 |
| --- | --- | --- |
| `.codex/agents/dotnet-testing-lite-unit-author.toml` | GPT-5.6 Sol（`gpt-5.6-sol`） | `medium` |
| `.codex/agents/dotnet-testing-lite-unit-verifier.toml` | GPT-5.6 Sol（`gpt-5.6-sol`） | `medium` |

兩個 Lite agent 都預設使用 GPT-5.6 Sol／medium。GPT-5.6 Sol 與 GPT-5.5
的單位費率相同，因此預設採用新版 Sol，不額外提高單位成本。這項設定不改變
workflow topology、repair 額度、coverage 規則或品質門檻；需要採用其他模型時，
可直接調整對應 TOML 的 `model` 與 `model_reasoning_effort`。

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
- `.codex/scripts/lite-unit/`：唯一 workflow driver、deterministic gates、artifact helpers、
  token estimator、build-first runner、Cobertura parser 與結果驗證。
- `.agents/skills/`：13 個 Unit testing skills 與必要 references／templates。
- `samples/unit/practice/`：net8.0、net9.0、net10.0 空白練習矩陣。

本 repo 不需要 clone 或安裝其他 testing-skill repository。Bogus 不在 lite
workflow；AutoFixture 只在複雜 object graph 時條件式使用。

13 個 Unit skills 都是可選技術來源，不是固定 routing 或必載清單。Agent 只有在
具體技術疑問無法由 source、project、gates 與實測證據解決時，才選讀最少相關來源。

本 workflow 可與原版 `dotnet-testing-agent-orchestration-codex` 安裝在同一個
workspace，再依情境選用。Lite 擁有的 `.codex/scripts` 入口一律使用 `lite-`
專屬目錄，正式 runtime 固定放在 `.codex/scripts/lite-unit/`，避免覆寫原版 runtime。
安裝時必須合併 workspace 的 `.codex/config.toml`，不可用任一 repo 的完整設定檔
覆寫另一份；README、CHANGELOG 與 samples 也不屬於疊加安裝資產。

## v1.1.0 deterministic workflow重整

v1.1.0因應`dotnet-testing-agent-skills v2.4.2`，把模型責任收斂為測試語意工作，並將
workflow state、machine truth、integrity、artifact、timing、token estimate與繁中final交由
`.codex/scripts/lite-unit/`的deterministic driver維護。

- Orchestrator只啟動driver、依action調度固定Author→Verifier拓樸，並逐字交付final。
- Author只建立高價值xUnit Unit Tests、處理test-only問題與唯一一次有限repair。
- Verifier對production與test delivery唯讀，獨立驗證build、test、target-scoped coverage及
  重要可測缺口。
- No-test、blocked、not-suitable與environment protection均有獨立machine state，不以測試數量、
  scenario拆分、skill選擇或低嚴重度措辭差異判定失敗。

Repository tests為125/125通過；public snapshot固定為179個檔案、2個Lite agents與13個Unit
skills。Final candidate的影響導向live批次為3/3 `hard-pass`，且production mutation為0。

## v1.0.0 Lite script 命名空間驗證

v1.0.0 將 Lite runtime 的入口統一為 `lite-` 前綴，helper 移至
`.codex/scripts/lite-unit/`，讓 Lite 與原版 workflow 可以共存。這次只調整 runtime
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
`.codex/scripts/lite-unit/`，不再散置於 `.codex/scripts/` 與根目錄 `scripts/`。
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

## 模型計價與 30-run 實驗

以下為 Standard／short-context API 美元費率與 ChatGPT Codex Credit rate，
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
