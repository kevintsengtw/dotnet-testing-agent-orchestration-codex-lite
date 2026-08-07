# GPT-5.5 medium、GPT-5.6 Luna max 與 GPT-5.6 Terra max Lite Agent 實驗結案報告

## 結案摘要

本實驗已完成固定 30-run matrix：三種 Lite agent 配置各執行 10 runs，共 36 次 target executions。三組使用相同 source commit、scenario、workflow topology、prompt、skills、scripts、repair 規則與品質門檻；唯一實驗變因是 Lite Author／Verifier 的 model 與 reasoning effort。

在這組樣本中，GPT-5.5 medium 的品質最穩定且 workflow span 最短；GPT-5.6 Luna max 的品質略低，但依新版費率換算後具備明顯的成本優勢；GPT-5.6 Terra max 雖比 GPT-5.5 便宜，卻沒有在本次結果中呈現相對 Luna 的品質、token 或耗時優勢。

對每月配置 400 credits、且 ChatGPT 與 Codex 共用額度的個人使用者，本報告建議以 Luna max 作為大量、可驗證 Unit Test 工作的預設層，將 GPT-5.5 medium 保留給品質失敗、重要商業邏輯與人工判定需要升級的 target。

## 實驗完整性

- Source commit：`f9cba9cc9af73ca2e0948223e58f6111a71f2aab`。
- Branch：`experiment/gpt55-medium-vs-gpt56-luna-terra-max`。
- Matrix：30/30 outer runs；三組各 10 runs；36 target executions。
- Outer coordinator：GPT-5.6 Sol／medium；Codex CLI 0.146.0；每格為 fresh `codex exec --ephemeral`。
- Controller SHA-256：`7045baffa950e544b715229cba74803e7edcc2fb38890fb62fb79b8013effb82`；controller tests 86/86 通過。
- 30 格 terminal usage 皆完整且唯一，token arithmetic 全部通過。
- Production integrity 全部通過；沒有第 31 格；完成時沒有 active outer process。

## 計價基準與估算邊界

API 美元採 2026-07-30 起的 Standard／short-context 費率；Codex credits 採目前官方 token-based rate card。Reasoning output 已包含於 output，不重複計價。

| 配置 | API uncached／cached／output（每 1M） | Credits uncached／cached／output（每 1M） |
| --- | ---: | ---: |
| GPT-5.5 medium | $5／$0.5／$30 | 125／12.5／750 |
| GPT-5.6 Sol medium | $5／$0.5／$30 | 125／12.5／750 |
| GPT-5.6 Terra max | $2／$0.2／$12 | 50／5／300 |
| GPT-5.6 Luna max | $0.2／$0.02／$1.2 | 5／0.5／30 |

> **計價註記：GPT-5.6 Sol 與 GPT-5.5 的單位費率相同。** Standard／short-context API 均為 uncached input $5、cached input $0.50、output $30／1M tokens；Codex 均為 125、12.5、750 credits／1M tokens。Reasoning effort 不改變單位費率，但會影響實際 token 用量與總成本。

本報告的「配置費率估算」會把每格 aggregate runtime usage 全部套用該組 Lite model 費率，目的是提供一致且容易規劃的相對成本指標。實際執行同時包含 GPT-5.6 Sol outer coordinator，現有 JSONL 沒有 per-model breakdown，因此這些數字不是 provider 帳單或 workspace 實際扣款。嚴格的實際成本仍應以企業後台 credit analytics／匯出資料為準。

官方資料：

- [GPT-5.6 降價公告](https://openai.com/zh-Hant/index/advancing-the-price-performance-frontier-with-gpt-5-6/)
- [OpenAI API Pricing](https://developers.openai.com/api/docs/pricing)
- [Codex Pricing 與 Credit rate card](https://learn.chatgpt.com/docs/pricing)

### GPT-5.6 Sol medium 費率換算參考（非第四組實驗）

本次固定 matrix 沒有把 Lite Author／Verifier 改成 GPT-5.6 Sol medium；Sol medium 只作為三組共同的 outer coordinator。因此下表不是新增的 Sol 10-run 實測，而是把三組既有 aggregate token totals 全部套用 Sol Standard／short-context 與 Credit rate，供後續預算敏感度比較使用。

| 既有 usage 來源 | Raw tokens | Sol API 成本估算 | Sol Credits 估算 | 占 400 credits |
| --- | ---: | ---: | ---: | ---: |
| GPT-5.5 medium | 15,224,236 | $14.249731 | 356.243275 | 89.06% |
| GPT-5.6 Luna max | 19,474,169 | $17.569258 | 439.231450 | 109.81% |
| GPT-5.6 Terra max | 19,910,275 | $17.724828 | 443.120700 | 110.78% |

Sol medium 與 GPT-5.5 medium 的每-token 費率相同。Reasoning effort 不改變單位費率，但會影響實際 token 量；在沒有 Sol medium Lite 10-run telemetry 前，不能把上述換算當成 Sol medium 的 token usage、品質或耗時預測。後續若正式加入 Sol，必須使用相同 10-run matrix 取得獨立 telemetry，再以本費率計算。

## 三組總覽

| 配置 | Raw tokens | Workflow span | Quality pass | Repair targets | API 成本估算 | Credits 估算 | 占 400 credits |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| GPT-5.5 medium | 15,224,236 | 7,624.281 秒 | 12/12 | 2 | $14.249731 | 356.243275 | 89.06% |
| GPT-5.6 Luna max | 19,474,169 | 10,223.138 秒 | 11/12 | 5 | $0.702770 | 17.569258 | 4.39% |
| GPT-5.6 Terra max | 19,910,275 | 13,887.696 秒 | 8/12 | 6 | $7.089931 | 177.248280 | 44.31% |

| 比較 | Raw token 差異 | Workflow span 差異 | Credits 估算差異 |
| --- | ---: | ---: | ---: |
| Luna vs GPT-5.5 | 27.92% | 34.09% | -95.07% |
| Terra vs GPT-5.5 | 30.78% | 82.15% | -50.25% |
| Terra vs Luna | 2.24% | 35.85% | 908.85% |

配置費率估算適合月度容量規劃；若只依現有 aggregate telemetry 建立不假設 per-model比例的嚴格界線，則為：

| 配置 | Standard API 成本界線 | Codex credits 界線 |
| --- | ---: | ---: |
| GPT-5.5 medium | $14.249731（精確） | 356.243275（精確） |
| GPT-5.6 Luna max | $0.702770–$17.569258 | 17.569258–439.231450 |
| GPT-5.6 Terra max | $7.089931–$17.724828 | 177.248280–443.120700 |

下界是假設全部 aggregate usage 都按 Lite candidate 費率計算，上界是假設全部按 outer Sol 費率計算；實際值位於兩者之間。Baseline 的 outer Sol 與 Lite GPT-5.5 費率相同，因此 aggregate 可直接得到單一值。

## GPT-5.5 medium：10 runs

| Run | Input（Cached） | Output | Raw tokens | Workflow | API 成本估算 | Credits 估算 | Target 結果 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| r1-temperature | 1,067,317（1,006,080） | 9,128 | 1,076,445 | 603.727 秒 | $1.083065 | 27.076625 | TemperatureConverter: pass／Q100／L100% B100% |
| r1-order-validator | 1,026,903（924,672） | 8,165 | 1,035,068 | 549.577 秒 | $1.218441 | 30.461025 | OrderValidator: best_effort／Q98／L97.14% B50% |
| r1-subscription | 1,410,090（1,350,144） | 8,350 | 1,418,440 | 564.259 秒 | $1.225302 | 30.632550 | SubscriptionService: pass／Q100／L100% B100% |
| r1-employee-related | 2,791,059（2,701,568） | 15,196 | 2,806,255 | 1,186.838 秒 | $2.254119 | 56.352975 | EmployeeService: pass／Q96／L100% B100%<br>EmployeeValidator: best_effort／Q98／L100% B75% |
| r1-order-processing | 945,223（857,344） | 8,372 | 953,595 | 568.444 秒 | $1.119227 | 27.980675 | OrderProcessingService: pass／Q100／L100% B100% |
| r2-temperature | 1,433,794（1,362,432） | 11,920 | 1,445,714 | 528.407 秒 | $1.395626 | 34.890650 | TemperatureConverter: pass／Q100／L100% B100% |
| r2-order-validator | 794,830（709,888） | 7,915 | 802,745 | 563.094 秒 | $1.017104 | 25.427600 | OrderValidator: best_effort／Q97／L97.14% B50% |
| r2-subscription | 935,446（879,616） | 7,703 | 943,149 | 576.329 秒 | $0.950048 | 23.751200 | SubscriptionService: pass／Q100／L100% B100% |
| r2-employee-related | 3,280,856（3,175,936） | 14,741 | 3,295,597 | 1,426.140 秒 | $2.554798 | 63.869950 | EmployeeService: pass／Q92／L100% B100%<br>EmployeeValidator: best_effort／Q100／L100% B75%、repair |
| r2-order-processing | 1,433,695（1,364,992） | 13,533 | 1,447,228 | 1,057.466 秒 | $1.432001 | 35.800025 | OrderProcessingService: pass／Q100／L100% B100%、repair |
| **合計** | **15,119,213（14,332,672）** | **105,023** | **15,224,236** | **7,624.281 秒** | **$14.249731** | **356.243275** | **Quality pass 12/12；fail 0/12** |

## GPT-5.6 Luna max：10 runs

| Run | Input（Cached） | Output | Raw tokens | Workflow | API 成本估算 | Credits 估算 | Target 結果 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| r1-temperature | 1,056,266（987,136） | 6,638 | 1,062,904 | 700.243 秒 | $0.041534 | 1.038358 | TemperatureConverter: pass／Q100／L100% B100% |
| r1-order-validator | 1,016,912（952,064） | 10,937 | 1,027,849 | 626.738 秒 | $0.045135 | 1.128382 | OrderValidator: best_effort／Q97／L97.14% B50% |
| r1-subscription | 1,682,169（1,604,352） | 9,001 | 1,691,170 | 1,368.213 秒 | $0.058452 | 1.461291 | SubscriptionService: pass／Q100／L100% B100% |
| r1-employee-related | 2,054,816（1,968,384） | 15,175 | 2,069,991 | 1,391.170 秒 | $0.074864 | 1.871602 | EmployeeService: fail／Q91／L100% B100%、repair<br>EmployeeValidator: best_effort／Q98／L100% B75% |
| r1-order-processing | 1,362,561（1,228,032） | 15,782 | 1,378,343 | 1,070.425 秒 | $0.070405 | 1.760121 | OrderProcessingService: pass／Q100／L100% B100%、repair |
| r2-temperature | 850,424（728,576） | 8,129 | 858,553 | 472.717 秒 | $0.048696 | 1.217398 | TemperatureConverter: pass／Q100／L100% B100% |
| r2-order-validator | 986,337（925,952） | 10,953 | 997,290 | 547.613 秒 | $0.043740 | 1.093491 | OrderValidator: best_effort／Q97／L97.14% B50% |
| r2-subscription | 1,481,369（1,398,784） | 15,474 | 1,496,843 | 841.738 秒 | $0.063061 | 1.576537 | SubscriptionService: pass／Q100／L100% B100%、repair |
| r2-employee-related | 6,298,411（6,156,800） | 16,705 | 6,315,116 | 1,438.172 秒 | $0.171504 | 4.287605 | EmployeeService: pass／Q95／L100% B100%、repair<br>EmployeeValidator: best_effort／Q98／L100% B75% |
| r2-order-processing | 2,561,235（2,470,656） | 14,875 | 2,576,110 | 1,766.109 秒 | $0.085379 | 2.134473 | OrderProcessingService: pass／Q100／L100% B100%、repair |
| **合計** | **19,350,500（18,420,736）** | **123,669** | **19,474,169** | **10,223.138 秒** | **$0.702770** | **17.569258** | **Quality pass 11/12；fail 1/12** |

## GPT-5.6 Terra max：10 runs

| Run | Input（Cached） | Output | Raw tokens | Workflow | API 成本估算 | Credits 估算 | Target 結果 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| r1-temperature | 1,152,707（1,081,600） | 6,781 | 1,159,488 | 715.374 秒 | $0.439906 | 10.997650 | TemperatureConverter: pass／Q100／L100% B100% |
| r1-order-validator | 1,988,342（1,901,568） | 11,382 | 1,999,724 | 1,493.436 秒 | $0.690446 | 17.261140 | OrderValidator: best_effort／Q100／L97.14% B50%、repair |
| r1-subscription | 3,007,197（2,860,032） | 15,367 | 3,022,564 | 1,380.919 秒 | $1.050740 | 26.268510 | SubscriptionService: pass／Q100／L100% B100%、repair |
| r1-employee-related | 2,243,613（2,158,848） | 13,155 | 2,256,768 | 1,826.737 秒 | $0.759160 | 18.978990 | EmployeeService: fail／Q85／L100% B100%<br>EmployeeValidator: fail／Q85／L100% B75% |
| r1-order-processing | 1,717,085（1,639,424） | 8,977 | 1,726,062 | 998.716 秒 | $0.590931 | 14.773270 | OrderProcessingService: pass／Q100／L100% B100% |
| r2-temperature | 994,903（939,008） | 7,960 | 1,002,863 | 600.889 秒 | $0.395112 | 9.877790 | TemperatureConverter: pass／Q100／L100% B100% |
| r2-order-validator | 1,866,087（1,781,504） | 11,440 | 1,877,527 | 1,397.100 秒 | $0.662747 | 16.568670 | OrderValidator: best_effort／Q100／L97.14% B50%、repair |
| r2-subscription | 1,165,938（1,098,752） | 8,302 | 1,174,240 | 907.857 秒 | $0.453746 | 11.343660 | SubscriptionService: pass／Q100／L100% B100% |
| r2-employee-related | 3,750,493（3,580,416） | 18,968 | 3,769,461 | 2,972.994 秒 | $1.283853 | 32.096330 | EmployeeService: fail／Q85／L100% B100%、repair<br>EmployeeValidator: fail／Q95／L90% B75%、repair |
| r2-order-processing | 1,909,585（1,777,664） | 11,993 | 1,921,578 | 1,593.674 秒 | $0.763291 | 19.082270 | OrderProcessingService: pass／Q100／L100% B100%、repair |
| **合計** | **19,795,950（18,818,816）** | **114,325** | **19,910,275** | **13,887.696 秒** | **$7.089931** | **177.248280** | **Quality pass 8/12；fail 4/12** |

## 品質判讀

- GPT-5.5 medium：12/12 targets quality pass，是本次品質基準。
- Luna max：11/12 targets quality pass；3 個配對低於 baseline，其中 `r1-employee-related/EmployeeService` 為 quality fail。
- Terra max：8/12 targets quality pass；4 個 employee-related 配對為 quality fail。
- 不得把 candidate 的總體 token 或成本差異全部宣稱為『品質等價下』的差異；不等價配對必須單獨保留。

不適合作為品質等價 token 比較的配對：

- candidate-luna-max／r1-order-validator／OrderValidator：qualityScore。
- candidate-luna-max／r1-employee-related／EmployeeService：terminalDecision、qualityStatus、qualityScore。
- candidate-luna-max／r2-employee-related／EmployeeValidator：qualityScore。
- candidate-terra-max／r1-employee-related／EmployeeService：terminalDecision、qualityStatus、qualityScore。
- candidate-terra-max／r1-employee-related／EmployeeValidator：terminalDecision、qualityStatus、qualityScore。
- candidate-terra-max／r2-employee-related／EmployeeService：terminalDecision、qualityStatus、qualityScore。
- candidate-terra-max／r2-employee-related／EmployeeValidator：terminalDecision、lineCoverage、qualityStatus、qualityScore。

## 每月 400 credits 的資源影響

| 配置 | 10 runs credits | 占 400 credits | 剩餘 credits | 400 credits 約可執行 runs |
| --- | ---: | ---: | ---: | ---: |
| GPT-5.5 medium | 356.243275 | 89.06% | 43.756725 | 11.23 |
| GPT-5.6 Luna max | 17.569258 | 4.39% | 382.430742 | 227.67 |
| GPT-5.6 Terra max | 177.248280 | 44.31% | 222.751720 | 22.57 |

若只把 20% 月額（80 credits）留給測試產生：

| 配置 | 約可執行 runs |
| --- | ---: |
| GPT-5.5 medium | 2.25 |
| GPT-5.6 Luna max | 45.53 |
| GPT-5.6 Terra max | 4.51 |

這組估算顯示，GPT-5.5 完整執行 10 runs 會消耗約 89% 月額；Terra 約 44%；Luna 約 4.4%。在還要保留 credits 給 ChatGPT 與日常開發的前提下，Luna 才有足夠的預算彈性。

## Token usage 取得方式稽核

### 這次 30 runs 實際使用的資料

這次正式 totals 不是只靠靜態 prompt estimator 推算，而是從每格 `codex exec --json` 的唯一 `turn.completed.usage` 讀取 runtime counters，包含 input、cached input、output 與 reasoning output。這比 workflow 執行前的 token estimator 更接近實際模型活動，也適合作為 outer run 的 aggregate usage truth。

限制是 terminal event 沒有 model 欄位。實際抽查 Luna `r1-temperature` JSONL 時，唯一 `turn.completed` 有完整 usage，但 `model` 與 `thread_id` 均不存在，因此不能把 outer Sol 與 Lite Author／Verifier用量拆開。

### 更好、更確實的取得方式

| 方法 | 可取得資料 | 精確度與用途 | 限制 |
| --- | --- | --- | --- |
| 企業 Global Admin Console／Billing credit export | 實際 credits、tokens、產品別、metered token type、model，並可查看個人使用者 | **實際成本的首選權威來源**；適合校正本報告估算 | 通常延遲 1–6 小時；需要管理員權限；未必直接帶實驗 run key |
| Codex OpenTelemetry `turn.token_usage` | 每 turn 的 total/input/cached/output/reasoning 指標；所有 metric 帶 model 預設欄位 | **未來 per-model 技術量測的最佳候選**；可由企業自有 collector保存 | 預設關閉；需部署 OTLP collector；官方文件未保證 spawned subagent 與 parent run 的完整關聯欄位，必須先做小型 pilot |
| `codex exec --json`／`turn.completed.usage` | 每個 outer process 的 aggregate runtime usage | 本實驗已採用；容易自動化、每格可追溯 | 沒有 per-model／subagent breakdown |
| CLI `/status`、`/usage` 或 App Server `account/usage/read` | Session usage、daily／weekly／cumulative account token activity | 適合個人即時檢查與前後差值校正 | 不適合直接還原每格與每個 subagent的模型用量 |
| Codex Analytics API | Workspace 層級的 aggregated Codex usage | 適合週期性企業報表與內部成本治理 | 不是 raw audit log；實際 schema與權限以登入後 reference為準 |
| 靜態 Lite token estimator | 依檔案與 prompt估計上下文 | 適合執行前預算與相對趨勢 | 不是 runtime usage，也不能當帳務依據 |

官方資料：

- [Global Admin Console](https://help.openai.com/en/articles/12289294-global-admin-console)
- [Codex monitoring and telemetry](https://learn.chatgpt.com/docs/config-file/config-advanced#monitoring-and-telemetry)
- [Codex non-interactive JSONL](https://learn.chatgpt.com/docs/developer-commands?surface=cli#cli-codex-exec)
- [Codex Analytics API](https://learn.chatgpt.com/docs/enterprise/analytics-api)

### 建議的後續量測方案

1. 保留目前每格 `turn.completed.usage`，繼續作為 run-level aggregate truth。
2. 請企業管理員匯出同一執行時段、同一使用者的 Codex credit analytics，以實際 model／token type／credits校正報告估值。
3. 未來另做 1–3 格非正式 pilot，啟用 OTel exporter，驗證 subagent是否能依 model與process／turn清楚歸屬；確認成功後才把 OTel納入正式 benchmark。
4. 在確認 OTel 前，不必重跑本次 30-run matrix；既有結果仍可作為可靠的 aggregate token、品質與耗時比較。

## 最終結論

- **品質優先：GPT-5.5 medium。** 但 10 runs 的規劃估算為 356.243 credits，對每月 400 credits 的使用者缺乏可持續性。
- **成本與可擴展性優先：GPT-5.6 Luna max。** 10 runs 的配置費率估算為 17.569 credits，品質為 11/12 targets pass，適合大量、可透過 gate驗證的測試產生。
- **Terra max 在本次 benchmark 沒有形成清楚的中間甜蜜點。** 它比 Luna 多用 2.24% raw tokens、workflow span 多 35.85%、credits估算約為 Luna的 10.09 倍，且 quality fail較多。
- 實務上建議採 Luna-first、quality-gated escalation：預設使用 Luna；只有 quality fail、repair未解決、重要商業邏輯或人工審查不足時，才升級 GPT-5.5。
- 真正的企業成本結論應以 Global Admin Console／Billing export 的實際 credits為準；本報告的配置費率估算用於容量規劃與模型選擇，不冒充實際扣款。

## 交付與限制

- 正式 machine-readable結果：`result.json`。
- 完整技術比較：`summary.md`。
- 本結案報告：`closing-report.md`。
- 本報告產生器：`create-closing-report.mjs`。
- Raw artifacts：`.workflow/gpt55-luna-terra-max-comparison/`。
- 主要限制：每組只有 10 runs、部分品質配對不等價、repair次數不同、沒有 outer end-to-end wall-clock、terminal aggregate usage沒有per-model breakdown。
