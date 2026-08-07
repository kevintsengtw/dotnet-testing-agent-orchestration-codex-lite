# GPT-5.5 medium、GPT-5.6 Luna max與GPT-5.6 Terra max Lite Agent Token Usage比較

本實驗以固定 source commit `f9cba9cc9af73ca2e0948223e58f6111a71f2aab`，在相同的 10-run matrix 上新執行 GPT-5.5 medium、GPT-5.6 Luna max 與 GPT-5.6 Terra max。Outer coordinator 三組均固定為 GPT-5.6 Sol／medium、Codex CLI 0.146.0。

## 完整性

- Matrix：30/30 outer runs；三組各 10 runs；36 target executions。
- Controller：SHA-256 `7045baffa950e544b715229cba74803e7edcc2fb38890fb62fb79b8013effb82`；86/86 tests 通過。
- Terminal usage：30 格皆完整且唯一，token arithmetic 全數通過。
- Production integrity：30 格皆通過；沒有第 31 格，完成時沒有 active outer process。

## 10-run token totals

| 組別 | Input | Cached input | Uncached input | Output | Reasoning output | Raw input + output |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GPT-5.5 medium baseline | 15,119,213 | 14,332,672 | 786,541 | 105,023 | 19,358 | 15,224,236 |
| GPT-5.6 Luna max candidate | 19,350,500 | 18,420,736 | 929,764 | 123,669 | 21,225 | 19,474,169 |
| GPT-5.6 Terra max candidate | 19,795,950 | 18,818,816 | 977,134 | 114,325 | 18,594 | 19,910,275 |

Reasoning output tokens 已包含在 output tokens 中，不另加到 raw input + output，也不重複計算 credits。

## 每格 token usage

| 組別 | Run key | Input | Cached | Uncached | Output | Reasoning output | Raw input + output |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline-gpt55-medium | r1-temperature | 1,067,317 | 1,006,080 | 61,237 | 9,128 | 1,941 | 1,076,445 |
| baseline-gpt55-medium | r1-order-validator | 1,026,903 | 924,672 | 102,231 | 8,165 | 1,399 | 1,035,068 |
| baseline-gpt55-medium | r1-subscription | 1,410,090 | 1,350,144 | 59,946 | 8,350 | 2,131 | 1,418,440 |
| baseline-gpt55-medium | r1-employee-related | 2,791,059 | 2,701,568 | 89,491 | 15,196 | 2,478 | 2,806,255 |
| baseline-gpt55-medium | r1-order-processing | 945,223 | 857,344 | 87,879 | 8,372 | 1,737 | 953,595 |
| baseline-gpt55-medium | r2-temperature | 1,433,794 | 1,362,432 | 71,362 | 11,920 | 2,112 | 1,445,714 |
| baseline-gpt55-medium | r2-order-validator | 794,830 | 709,888 | 84,942 | 7,915 | 1,699 | 802,745 |
| baseline-gpt55-medium | r2-subscription | 935,446 | 879,616 | 55,830 | 7,703 | 1,307 | 943,149 |
| baseline-gpt55-medium | r2-employee-related | 3,280,856 | 3,175,936 | 104,920 | 14,741 | 1,804 | 3,295,597 |
| baseline-gpt55-medium | r2-order-processing | 1,433,695 | 1,364,992 | 68,703 | 13,533 | 2,750 | 1,447,228 |
| candidate-luna-max | r1-temperature | 1,056,266 | 987,136 | 69,130 | 6,638 | 1,231 | 1,062,904 |
| candidate-luna-max | r1-order-validator | 1,016,912 | 952,064 | 64,848 | 10,937 | 1,955 | 1,027,849 |
| candidate-luna-max | r1-subscription | 1,682,169 | 1,604,352 | 77,817 | 9,001 | 2,385 | 1,691,170 |
| candidate-luna-max | r1-employee-related | 2,054,816 | 1,968,384 | 86,432 | 15,175 | 2,394 | 2,069,991 |
| candidate-luna-max | r1-order-processing | 1,362,561 | 1,228,032 | 134,529 | 15,782 | 2,209 | 1,378,343 |
| candidate-luna-max | r2-temperature | 850,424 | 728,576 | 121,848 | 8,129 | 2,084 | 858,553 |
| candidate-luna-max | r2-order-validator | 986,337 | 925,952 | 60,385 | 10,953 | 2,354 | 997,290 |
| candidate-luna-max | r2-subscription | 1,481,369 | 1,398,784 | 82,585 | 15,474 | 2,020 | 1,496,843 |
| candidate-luna-max | r2-employee-related | 6,298,411 | 6,156,800 | 141,611 | 16,705 | 1,995 | 6,315,116 |
| candidate-luna-max | r2-order-processing | 2,561,235 | 2,470,656 | 90,579 | 14,875 | 2,598 | 2,576,110 |
| candidate-terra-max | r1-temperature | 1,152,707 | 1,081,600 | 71,107 | 6,781 | 1,216 | 1,159,488 |
| candidate-terra-max | r1-order-validator | 1,988,342 | 1,901,568 | 86,774 | 11,382 | 1,989 | 1,999,724 |
| candidate-terra-max | r1-subscription | 3,007,197 | 2,860,032 | 147,165 | 15,367 | 3,100 | 3,022,564 |
| candidate-terra-max | r1-employee-related | 2,243,613 | 2,158,848 | 84,765 | 13,155 | 1,515 | 2,256,768 |
| candidate-terra-max | r1-order-processing | 1,717,085 | 1,639,424 | 77,661 | 8,977 | 1,691 | 1,726,062 |
| candidate-terra-max | r2-temperature | 994,903 | 939,008 | 55,895 | 7,960 | 1,190 | 1,002,863 |
| candidate-terra-max | r2-order-validator | 1,866,087 | 1,781,504 | 84,583 | 11,440 | 2,089 | 1,877,527 |
| candidate-terra-max | r2-subscription | 1,165,938 | 1,098,752 | 67,186 | 8,302 | 1,910 | 1,174,240 |
| candidate-terra-max | r2-employee-related | 3,750,493 | 3,580,416 | 170,077 | 18,968 | 1,798 | 3,769,461 |
| candidate-terra-max | r2-order-processing | 1,909,585 | 1,777,664 | 131,921 | 11,993 | 2,096 | 1,921,578 |

## Scenario r1／r2／median token usage

| 組別 | Scenario | 統計 | Input | Cached | Uncached | Output | Reasoning output | Raw input + output |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline-gpt55-medium | temperature | r1 | 1,067,317 | 1,006,080 | 61,237 | 9,128 | 1,941 | 1,076,445 |
| baseline-gpt55-medium | temperature | r2 | 1,433,794 | 1,362,432 | 71,362 | 11,920 | 2,112 | 1,445,714 |
| baseline-gpt55-medium | temperature | median | 1,250,555.5 | 1,184,256 | 66,299.5 | 10,524 | 2,026.5 | 1,261,079.5 |
| baseline-gpt55-medium | order-validator | r1 | 1,026,903 | 924,672 | 102,231 | 8,165 | 1,399 | 1,035,068 |
| baseline-gpt55-medium | order-validator | r2 | 794,830 | 709,888 | 84,942 | 7,915 | 1,699 | 802,745 |
| baseline-gpt55-medium | order-validator | median | 910,866.5 | 817,280 | 93,586.5 | 8,040 | 1,549 | 918,906.5 |
| baseline-gpt55-medium | subscription | r1 | 1,410,090 | 1,350,144 | 59,946 | 8,350 | 2,131 | 1,418,440 |
| baseline-gpt55-medium | subscription | r2 | 935,446 | 879,616 | 55,830 | 7,703 | 1,307 | 943,149 |
| baseline-gpt55-medium | subscription | median | 1,172,768 | 1,114,880 | 57,888 | 8,026.5 | 1,719 | 1,180,794.5 |
| baseline-gpt55-medium | employee-related | r1 | 2,791,059 | 2,701,568 | 89,491 | 15,196 | 2,478 | 2,806,255 |
| baseline-gpt55-medium | employee-related | r2 | 3,280,856 | 3,175,936 | 104,920 | 14,741 | 1,804 | 3,295,597 |
| baseline-gpt55-medium | employee-related | median | 3,035,957.5 | 2,938,752 | 97,205.5 | 14,968.5 | 2,141 | 3,050,926 |
| baseline-gpt55-medium | order-processing | r1 | 945,223 | 857,344 | 87,879 | 8,372 | 1,737 | 953,595 |
| baseline-gpt55-medium | order-processing | r2 | 1,433,695 | 1,364,992 | 68,703 | 13,533 | 2,750 | 1,447,228 |
| baseline-gpt55-medium | order-processing | median | 1,189,459 | 1,111,168 | 78,291 | 10,952.5 | 2,243.5 | 1,200,411.5 |
| candidate-luna-max | temperature | r1 | 1,056,266 | 987,136 | 69,130 | 6,638 | 1,231 | 1,062,904 |
| candidate-luna-max | temperature | r2 | 850,424 | 728,576 | 121,848 | 8,129 | 2,084 | 858,553 |
| candidate-luna-max | temperature | median | 953,345 | 857,856 | 95,489 | 7,383.5 | 1,657.5 | 960,728.5 |
| candidate-luna-max | order-validator | r1 | 1,016,912 | 952,064 | 64,848 | 10,937 | 1,955 | 1,027,849 |
| candidate-luna-max | order-validator | r2 | 986,337 | 925,952 | 60,385 | 10,953 | 2,354 | 997,290 |
| candidate-luna-max | order-validator | median | 1,001,624.5 | 939,008 | 62,616.5 | 10,945 | 2,154.5 | 1,012,569.5 |
| candidate-luna-max | subscription | r1 | 1,682,169 | 1,604,352 | 77,817 | 9,001 | 2,385 | 1,691,170 |
| candidate-luna-max | subscription | r2 | 1,481,369 | 1,398,784 | 82,585 | 15,474 | 2,020 | 1,496,843 |
| candidate-luna-max | subscription | median | 1,581,769 | 1,501,568 | 80,201 | 12,237.5 | 2,202.5 | 1,594,006.5 |
| candidate-luna-max | employee-related | r1 | 2,054,816 | 1,968,384 | 86,432 | 15,175 | 2,394 | 2,069,991 |
| candidate-luna-max | employee-related | r2 | 6,298,411 | 6,156,800 | 141,611 | 16,705 | 1,995 | 6,315,116 |
| candidate-luna-max | employee-related | median | 4,176,613.5 | 4,062,592 | 114,021.5 | 15,940 | 2,194.5 | 4,192,553.5 |
| candidate-luna-max | order-processing | r1 | 1,362,561 | 1,228,032 | 134,529 | 15,782 | 2,209 | 1,378,343 |
| candidate-luna-max | order-processing | r2 | 2,561,235 | 2,470,656 | 90,579 | 14,875 | 2,598 | 2,576,110 |
| candidate-luna-max | order-processing | median | 1,961,898 | 1,849,344 | 112,554 | 15,328.5 | 2,403.5 | 1,977,226.5 |
| candidate-terra-max | temperature | r1 | 1,152,707 | 1,081,600 | 71,107 | 6,781 | 1,216 | 1,159,488 |
| candidate-terra-max | temperature | r2 | 994,903 | 939,008 | 55,895 | 7,960 | 1,190 | 1,002,863 |
| candidate-terra-max | temperature | median | 1,073,805 | 1,010,304 | 63,501 | 7,370.5 | 1,203 | 1,081,175.5 |
| candidate-terra-max | order-validator | r1 | 1,988,342 | 1,901,568 | 86,774 | 11,382 | 1,989 | 1,999,724 |
| candidate-terra-max | order-validator | r2 | 1,866,087 | 1,781,504 | 84,583 | 11,440 | 2,089 | 1,877,527 |
| candidate-terra-max | order-validator | median | 1,927,214.5 | 1,841,536 | 85,678.5 | 11,411 | 2,039 | 1,938,625.5 |
| candidate-terra-max | subscription | r1 | 3,007,197 | 2,860,032 | 147,165 | 15,367 | 3,100 | 3,022,564 |
| candidate-terra-max | subscription | r2 | 1,165,938 | 1,098,752 | 67,186 | 8,302 | 1,910 | 1,174,240 |
| candidate-terra-max | subscription | median | 2,086,567.5 | 1,979,392 | 107,175.5 | 11,834.5 | 2,505 | 2,098,402 |
| candidate-terra-max | employee-related | r1 | 2,243,613 | 2,158,848 | 84,765 | 13,155 | 1,515 | 2,256,768 |
| candidate-terra-max | employee-related | r2 | 3,750,493 | 3,580,416 | 170,077 | 18,968 | 1,798 | 3,769,461 |
| candidate-terra-max | employee-related | median | 2,997,053 | 2,869,632 | 127,421 | 16,061.5 | 1,656.5 | 3,013,114.5 |
| candidate-terra-max | order-processing | r1 | 1,717,085 | 1,639,424 | 77,661 | 8,977 | 1,691 | 1,726,062 |
| candidate-terra-max | order-processing | r2 | 1,909,585 | 1,777,664 | 131,921 | 11,993 | 2,096 | 1,921,578 |
| candidate-terra-max | order-processing | median | 1,813,335 | 1,708,544 | 104,791 | 10,485 | 1,893.5 | 1,823,820 |

## Pairwise token totals

| 比較 | 指標 | 參考值 | 比較值 | 絕對差 | 百分比差 |
| --- | --- | ---: | ---: | ---: | ---: |
| candidate-luna-max vs baseline-gpt55-medium | inputTokens | 15,119,213 | 19,350,500 | 4,231,287 | +27.986159% |
| candidate-luna-max vs baseline-gpt55-medium | cachedInputTokens | 14,332,672 | 18,420,736 | 4,088,064 | +28.522693% |
| candidate-luna-max vs baseline-gpt55-medium | uncachedInputTokens | 786,541 | 929,764 | 143,223 | +18.209222% |
| candidate-luna-max vs baseline-gpt55-medium | outputTokens | 105,023 | 123,669 | 18,646 | +17.754206% |
| candidate-luna-max vs baseline-gpt55-medium | reasoningOutputTokens | 19,358 | 21,225 | 1,867 | +9.644591% |
| candidate-luna-max vs baseline-gpt55-medium | rawInputPlusOutputTokens | 15,224,236 | 19,474,169 | 4,249,933 | +27.915575% |
| candidate-terra-max vs baseline-gpt55-medium | inputTokens | 15,119,213 | 19,795,950 | 4,676,737 | +30.93241% |
| candidate-terra-max vs baseline-gpt55-medium | cachedInputTokens | 14,332,672 | 18,818,816 | 4,486,144 | +31.300123% |
| candidate-terra-max vs baseline-gpt55-medium | uncachedInputTokens | 786,541 | 977,134 | 190,593 | +24.231795% |
| candidate-terra-max vs baseline-gpt55-medium | outputTokens | 105,023 | 114,325 | 9,302 | +8.857107% |
| candidate-terra-max vs baseline-gpt55-medium | reasoningOutputTokens | 19,358 | 18,594 | -764 | -3.946689% |
| candidate-terra-max vs baseline-gpt55-medium | rawInputPlusOutputTokens | 15,224,236 | 19,910,275 | 4,686,039 | +30.780126% |
| candidate-terra-max vs candidate-luna-max | inputTokens | 19,350,500 | 19,795,950 | 445,450 | +2.302008% |
| candidate-terra-max vs candidate-luna-max | cachedInputTokens | 18,420,736 | 18,818,816 | 398,080 | +2.161043% |
| candidate-terra-max vs candidate-luna-max | uncachedInputTokens | 929,764 | 977,134 | 47,370 | +5.094841% |
| candidate-terra-max vs candidate-luna-max | outputTokens | 123,669 | 114,325 | -9,344 | -7.555653% |
| candidate-terra-max vs candidate-luna-max | reasoningOutputTokens | 21,225 | 18,594 | -2,631 | -12.39576% |
| candidate-terra-max vs candidate-luna-max | rawInputPlusOutputTokens | 19,474,169 | 19,910,275 | 436,106 | +2.239407% |

百分比固定採 `(比較組 - 參考組) / 參考組 × 100%`；正數代表比較組使用更多 tokens。

## Credits

| Model | Input／Cached input／Output（每 1M tokens） |
| --- | ---: |
| gpt-5.5 | 125／12.5／750 credits |
| gpt-5.6-sol | 125／12.5／750 credits |
| gpt-5.6-terra | 50／5／300 credits |
| gpt-5.6-luna | 5／0.5／30 credits |

> **計價註記：GPT-5.6 Sol 與 GPT-5.5 的單位費率相同。** Codex 均為 input 125、cached input 12.5、output 750 credits／1M tokens。Reasoning effort 不改變單位費率，但會影響實際 token 用量與總成本。

- baseline-gpt55-medium：356.243275 credits（aggregate 精確值）。
- candidate-luna-max：17.569258–439.23145 credits（aggregate telemetry 無 per-model breakdown，僅能呈現區間）。
- candidate-terra-max：177.24828–443.1207 credits（aggregate telemetry 無 per-model breakdown，僅能呈現區間）。

Pairwise credits（區間差採 comparison range 減 reference range）：

- candidate-luna-max vs baseline-gpt55-medium：差異 -338.674017 至 82.988175 credits；百分比 -95.068185% 至 +23.295366%。
- candidate-terra-max vs baseline-gpt55-medium：差異 -178.994995 至 86.877425 credits；百分比 -50.245158% 至 +24.387106%。
- candidate-terra-max vs candidate-luna-max：差異 -261.98317 至 425.551442 credits；百分比 -59.645813% 至 +2,422.136678%。

GPT-5.6 Sol medium 費率換算參考（非第四組 Lite 實驗）：

| 既有 usage 來源 | Sol medium 費率估算 | 占 400 credits |
| --- | ---: | ---: |
| baseline-gpt55-medium | 356.243275 credits | 89.06% |
| candidate-luna-max | 439.23145 credits | 109.81% |
| candidate-terra-max | 443.1207 credits | 110.78% |

這只是把既有 aggregate tokens 全部套用 Sol rate 的費率敏感度分析。Sol medium 沒有執行獨立的 Lite 10-run matrix；reasoning effort 不改變每 token 費率，但會改變實際 token 量，因此不得把上表當成 Sol medium 的實測 token、品質或耗時結果。

Rate card 已於 2026-08-07 依官方 Codex Pricing 核對；不代表 API key billing 成本或 provider 實際扣款。

## Workflow duration

| 組別 | 10-run workflow span 總和 | 每格 median | Target duration 總和 | Repair targets | Repair phases 總和 |
| --- | ---: | ---: | ---: | ---: | ---: |
| GPT-5.5 medium baseline | 7,624.281 秒 | 572.386 秒 | 7,588.731 秒 | 2 | 617.523 秒 |
| GPT-5.6 Luna max candidate | 10,223.138 秒 | 956.082 秒 | 10,200.145 秒 | 5 | 1,741.949 秒 |
| GPT-5.6 Terra max candidate | 13,887.696 秒 | 1,389.009 秒 | 13,862.241 秒 | 6 | 2,799.679 秒 |

Pairwise workflow duration：

| 比較 | 指標 | 參考值 | 比較值 | 絕對差 | 百分比差 |
| --- | --- | ---: | ---: | ---: | ---: |
| candidate-luna-max vs baseline-gpt55-medium | workflowSpanTotalMs | 7,624.281 秒 | 10,223.138 秒 | 2,598.857 秒 | +34.086585% |
| candidate-luna-max vs baseline-gpt55-medium | workflowSpanMedianMs | 572.386 秒 | 956.082 秒 | 383.695 秒 | +67.03425% |
| candidate-luna-max vs baseline-gpt55-medium | targetDurationTotalMs | 7,588.731 秒 | 10,200.145 秒 | 2,611.414 秒 | +34.411735% |
| candidate-luna-max vs baseline-gpt55-medium | repairAddedPhaseDurationTotalMs | 617.523 秒 | 1,741.949 秒 | 1,124.426 秒 | +182.086497% |
| candidate-terra-max vs baseline-gpt55-medium | workflowSpanTotalMs | 7,624.281 秒 | 13,887.696 秒 | 6,263.415 秒 | +82.150894% |
| candidate-terra-max vs baseline-gpt55-medium | workflowSpanMedianMs | 572.386 秒 | 1,389.009 秒 | 816.623 秒 | +142.669857% |
| candidate-terra-max vs baseline-gpt55-medium | targetDurationTotalMs | 7,588.731 秒 | 13,862.241 秒 | 6,273.51 秒 | +82.668762% |
| candidate-terra-max vs baseline-gpt55-medium | repairAddedPhaseDurationTotalMs | 617.523 秒 | 2,799.679 秒 | 2,182.156 秒 | +353.372425% |
| candidate-terra-max vs candidate-luna-max | workflowSpanTotalMs | 10,223.138 秒 | 13,887.696 秒 | 3,664.558 秒 | +35.845726% |
| candidate-terra-max vs candidate-luna-max | workflowSpanMedianMs | 956.082 秒 | 1,389.009 秒 | 432.928 秒 | +45.281495% |
| candidate-terra-max vs candidate-luna-max | targetDurationTotalMs | 10,200.145 秒 | 13,862.241 秒 | 3,662.096 秒 | +35.902392% |
| candidate-terra-max vs candidate-luna-max | repairAddedPhaseDurationTotalMs | 1,741.949 秒 | 2,799.679 秒 | 1,057.73 秒 | +60.721066% |

Scenario workflow span（r1／r2／median）：

| 組別 | Scenario | r1 | r2 | Median |
| --- | --- | ---: | ---: | ---: |
| baseline-gpt55-medium | temperature | 603.727 秒 | 528.407 秒 | 566.067 秒 |
| baseline-gpt55-medium | order-validator | 549.577 秒 | 563.094 秒 | 556.336 秒 |
| baseline-gpt55-medium | subscription | 564.259 秒 | 576.329 秒 | 570.294 秒 |
| baseline-gpt55-medium | employee-related | 1,186.838 秒 | 1,426.14 秒 | 1,306.489 秒 |
| baseline-gpt55-medium | order-processing | 568.444 秒 | 1,057.466 秒 | 812.955 秒 |
| candidate-luna-max | temperature | 700.243 秒 | 472.717 秒 | 586.48 秒 |
| candidate-luna-max | order-validator | 626.738 秒 | 547.613 秒 | 587.176 秒 |
| candidate-luna-max | subscription | 1,368.213 秒 | 841.738 秒 | 1,104.976 秒 |
| candidate-luna-max | employee-related | 1,391.17 秒 | 1,438.172 秒 | 1,414.671 秒 |
| candidate-luna-max | order-processing | 1,070.425 秒 | 1,766.109 秒 | 1,418.267 秒 |
| candidate-terra-max | temperature | 715.374 秒 | 600.889 秒 | 658.131 秒 |
| candidate-terra-max | order-validator | 1,493.436 秒 | 1,397.1 秒 | 1,445.268 秒 |
| candidate-terra-max | subscription | 1,380.919 秒 | 907.857 秒 | 1,144.388 秒 |
| candidate-terra-max | employee-related | 1,826.737 秒 | 2,972.994 秒 | 2,399.865 秒 |
| candidate-terra-max | order-processing | 998.716 秒 | 1,593.674 秒 | 1,296.195 秒 |

Workflow duration 取自正式 run manifests；沒有可靠且可正規化的 outer launch/exit timestamps，因此不得解讀為 outer end-to-end wall-clock time。

Repair targets 與 repair phase duration 在三組間不同，會同時影響 aggregate tokens 與 workflow duration；terminal telemetry 沒有 phase-level provider token breakdown，因此不能把 token 差異精確歸因到 repair。

## 品質配對

| 組別 | Run key | Target | Lifecycle／decision | Tests | Line／branch | Quality／score | Repair | Production |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- |
| baseline-gpt55-medium | r1-temperature | TemperatureConverter | pass／pass | 35/35 | 100%／100% | pass／100 | 否 | passed |
| baseline-gpt55-medium | r1-order-validator | OrderValidator | best_effort／best_effort | 47/47 | 97.14%／50% | pass／98 | 否 | passed |
| baseline-gpt55-medium | r1-subscription | SubscriptionService | pass／pass | 44/44 | 100%／100% | pass／100 | 否 | passed |
| baseline-gpt55-medium | r1-employee-related | EmployeeService | pass／pass | 43/43 | 100%／100% | pass／96 | 否 | passed |
| baseline-gpt55-medium | r1-employee-related | EmployeeValidator | best_effort／best_effort | 72/72 | 100%／75% | pass／98 | 否 | passed |
| baseline-gpt55-medium | r1-order-processing | OrderProcessingService | pass／pass | 33/33 | 100%／100% | pass／100 | 否 | passed |
| baseline-gpt55-medium | r2-temperature | TemperatureConverter | pass／pass | 33/33 | 100%／100% | pass／100 | 否 | passed |
| baseline-gpt55-medium | r2-order-validator | OrderValidator | best_effort／best_effort | 22/22 | 97.14%／50% | pass／97 | 否 | passed |
| baseline-gpt55-medium | r2-subscription | SubscriptionService | completed／pass | 41/41 | 100%／100% | pass／100 | 否 | passed |
| baseline-gpt55-medium | r2-employee-related | EmployeeService | pass／pass | 33/33 | 100%／100% | pass／92 | 否 | passed |
| baseline-gpt55-medium | r2-employee-related | EmployeeValidator | best_effort／best_effort | 75/75 | 100%／75% | pass／100 | 是 | passed |
| baseline-gpt55-medium | r2-order-processing | OrderProcessingService | pass／pass | 35/35 | 100%／100% | pass／100 | 是 | passed |
| candidate-luna-max | r1-temperature | TemperatureConverter | pass／pass | 35/35 | 100%／100% | pass／100 | 否 | passed |
| candidate-luna-max | r1-order-validator | OrderValidator | best_effort／best_effort | 25/25 | 97.14%／50% | pass／97 | 否 | passed |
| candidate-luna-max | r1-subscription | SubscriptionService | pass／pass | 48/48 | 100%／100% | pass／100 | 否 | passed |
| candidate-luna-max | r1-employee-related | EmployeeService | fail／fail | 38/38 | 100%／100% | fail／91 | 是 | passed |
| candidate-luna-max | r1-employee-related | EmployeeValidator | best_effort／best_effort | 72/72 | 100%／75% | pass／98 | 否 | passed |
| candidate-luna-max | r1-order-processing | OrderProcessingService | pass／pass | 40/40 | 100%／100% | pass／100 | 是 | passed |
| candidate-luna-max | r2-temperature | TemperatureConverter | pass／pass | 35/35 | 100%／100% | pass／100 | 否 | passed |
| candidate-luna-max | r2-order-validator | OrderValidator | best_effort／best_effort | 26/26 | 97.14%／50% | pass／97 | 否 | passed |
| candidate-luna-max | r2-subscription | SubscriptionService | pass／pass | 38/38 | 100%／100% | pass／100 | 是 | passed |
| candidate-luna-max | r2-employee-related | EmployeeService | pass／pass | 39/39 | 100%／100% | pass／95 | 是 | passed |
| candidate-luna-max | r2-employee-related | EmployeeValidator | best_effort／best_effort | 76/76 | 100%／75% | pass／98 | 否 | passed |
| candidate-luna-max | r2-order-processing | OrderProcessingService | pass／pass | 40/40 | 100%／100% | pass／100 | 是 | passed |
| candidate-terra-max | r1-temperature | TemperatureConverter | pass／pass | 36/36 | 100%／100% | pass／100 | 否 | passed |
| candidate-terra-max | r1-order-validator | OrderValidator | best_effort／best_effort | 25/25 | 97.14%／50% | pass／100 | 是 | passed |
| candidate-terra-max | r1-subscription | SubscriptionService | completed／pass | 40/40 | 100%／100% | pass／100 | 是 | passed |
| candidate-terra-max | r1-employee-related | EmployeeService | fail／fail | 26/26 | 100%／100% | fail／85 | 否 | passed |
| candidate-terra-max | r1-employee-related | EmployeeValidator | fail／fail | 55/55 | 100%／75% | fail／85 | 否 | passed |
| candidate-terra-max | r1-order-processing | OrderProcessingService | pass／pass | 37/37 | 100%／100% | pass／100 | 否 | passed |
| candidate-terra-max | r2-temperature | TemperatureConverter | pass／pass | 30/30 | 100%／100% | pass／100 | 否 | passed |
| candidate-terra-max | r2-order-validator | OrderValidator | best_effort／best_effort | 21/21 | 97.14%／50% | pass／100 | 是 | passed |
| candidate-terra-max | r2-subscription | SubscriptionService | pass／pass | 39/39 | 100%／100% | pass／100 | 否 | passed |
| candidate-terra-max | r2-employee-related | EmployeeService | fail／fail | 33/33 | 100%／100% | fail／85 | 是 | passed |
| candidate-terra-max | r2-employee-related | EmployeeValidator | fail／fail | 64/64 | 90%／75% | fail／95 | 是 | passed |
| candidate-terra-max | r2-order-processing | OrderProcessingService | pass／pass | 37/37 | 100%／100% | pass／100 | 是 | passed |

下列配對不適合作為品質等價下的 token 比較：

- candidate-luna-max / r1-order-validator / OrderValidator：qualityScore。
- candidate-luna-max / r1-employee-related / EmployeeService：terminalDecision、qualityStatus、qualityScore。
- candidate-luna-max / r2-employee-related / EmployeeValidator：qualityScore。
- candidate-terra-max / r1-employee-related / EmployeeService：terminalDecision、qualityStatus、qualityScore。
- candidate-terra-max / r1-employee-related / EmployeeValidator：terminalDecision、qualityStatus、qualityScore。
- candidate-terra-max / r2-employee-related / EmployeeService：terminalDecision、qualityStatus、qualityScore。
- candidate-terra-max / r2-employee-related / EmployeeValidator：terminalDecision、lineCoverage、qualityStatus、qualityScore。

合法的 `best_effort`、`fail`、`not_suitable` 或 `blocked` 是實驗結果，不是 coordinator failure；所有 evidence 完整的格均保留並計入 matrix。

## 能回答與不能回答的問題

本結果可描述固定 targets、固定 workflow 與本次 10-run/group 樣本中，三組 aggregate terminal token usage、workflow durations、repair 與 target-level 品質的觀察差異。

它不能證明三個模型品質等價、在其他 targets 一定更好或更快，也不能從 aggregate terminal telemetry 精確拆出 outer Sol 與 candidate Lite agents 各自 tokens。10 runs 只能提供有限的重複性觀察；repair、合法 test-project delivery 差異及 target 難度也可能影響 tokens 與耗時。

完整逐格 usage、scenario r1/r2 與 medians、phase durations、quality pairing、raw provenance 與 pairwise 差異請見 `result.json`。
