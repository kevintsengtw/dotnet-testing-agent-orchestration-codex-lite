---
name: dotnet-testing-unit-authoring
description: 精簡的 xUnit Unit Test 分析與撰寫規則，涵蓋 scenarios、命名、assertions、mock 與 coverage-first 設計。
---

# Unit Authoring

## Coverage-first 分析

對每個 public behavior列出：

- 正常路徑與回傳值
- null/empty/range guards
- 邊界值的前一點、邊界、後一點
- 每個 `if`、switch arm、短路條件與例外路徑
- 可觀察 side effects與 dependency interaction

不要為 auto-property、無行為 DTO 或 framework code製造無價值 tests。

## 測試價值門檻

每個 test 在動手寫之前都必須回答：「哪一種合理的錯誤實作會使它失敗？」
答案寫入 scenario 的 `failureMode`。只有下列兩類可進入測試碼：

- `contract`：保護 user、documentation 或 public contract 可觀察的行為。
- `characterization`：鎖定已被呼叫端依賴、且改變時有回歸風險的既有行為。

以下預設為低價值，不得為提高 coverage 而寫：

- 只驗證不拋例外、可建構、非 null 或 interface assignability。
- 先寫入 auto-property 再讀回相同值。
- 不含獨立期望值的物件自我比對。
- 只鎖 private field、private call order 或 framework 行為。

`NotThrow` 只有在公開契約明確要求容忍某輸入，且 Arrange 確實觸發可能失敗的
操作時才可作為輔助 assertion；不能單獨構成 oracle。Constructor test 必須驗證
公開 guard、default 或可觀察初始狀態，不能只證明 constructor 可執行。

移除低價值候選後若沒有任何 scenario，輸出 `no_valuable_tests`：保留完整
completeness audit，並逐項記錄候選行為的 `unobservable|out-of-scope|low-value`
disposition 與理由。不得保留空殼測試；此結果必須再由 Verifier 獨立確認。

## xUnit 寫法

- 一個 test 驗證一個行為；重複輸入使用 `[Theory]`。
- 命名：`方法名_情境描述_預期結果`；完整規則以 `dotnet-testing-test-naming-conventions` 為準。
- Arrange / Act / Assert 清楚分段，避免過度 fixture abstraction。
- 使用 AwesomeAssertions；數值使用合理 tolerance，集合與物件比較所有重要欄位。
- 例外同時驗證型別與必要參數／訊息。

## Test doubles

- 只 substitute 外部 dependency，不 mock 被測物件。
- 回傳值設定用於 state/output；`Received` 用於必要 interaction。
- 驗證重要參數，不使用過寬 `Arg.Any` 隱藏錯誤。
- 不驗證 implementation detail 或不重要 call order。

## Test data

- 簡單值直接寫明，讓邊界可讀。
- 複雜 graph 才使用 AutoFixture；重要 boundary 仍明確指定。
- 先沿用 csproj 已有 packages，不為風格偏好新增套件。

## 完成條件

- 所有合理 scenarios 與使用者 scenarios 都可追溯。
- tests 含有效 assertions。
- 每個 scenario 都有 `contract|characterization` 價值分類與具體 failure mode。
- 不修改 production。
- 實測 coverage 尚未取得前，不宣稱 100%。
