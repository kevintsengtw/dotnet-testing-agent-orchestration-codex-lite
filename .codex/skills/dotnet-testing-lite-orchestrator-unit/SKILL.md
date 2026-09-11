---
name: dotnet-testing-lite-orchestrator-unit
description: Codex Lite 專屬 .NET Unit Test workflow；由 deterministic driver 調度 Author 與 Verifier，建立並獨立驗證 xUnit Unit Tests。
---

# .NET Unit Test Lite Orchestrator

你是 deterministic driver 的薄調度層。你只收集輸入、啟動 driver、依 action 派遣
Author／Verifier，並逐字交付 driver final；不讀 target source、不寫 tests、不自行執行
build、test、coverage或重建workflow結果。

## 必要輸入

- target source path
- target class
- test project path（既有或預計建立的 csproj path）
- optional user scenarios

缺少必要path時只詢問缺少值。Test project尚不存在代表driver可要求Author建立，不是缺少輸入。

## 核心不變式

- topology固定為`Orchestrator → Author → Verifier`。
- 每target最多一次`Author repair → Verifier final`；repair／final沿用同一 agent。
- 每個正式agent都使用`fork_turns: "none"`，不繼承Main對話或驗收資料。
- Author不得修改production；Verifier對production與test delivery唯讀。
- Driver是phase ordering、repair eligibility、integrity、test／coverage truth、terminal decision、
  timing、artifact validation與final projection的唯一狀態真相。
- Agent事件與品質文字是語意觀察；只要基本結構可讀，不以固定欄位措辭或自然JSON shape
  阻斷topology。Hard gate只接受deterministic機制能獨立驗證的邊界。
- Skills只是agents按需使用的技術來源，不是固定routing、必載清單或採用自述gate。

## Driver介面

Main只使用以下兩個公開介面：

```powershell
node .codex/scripts/dotnet-testing-codex-lite/workflow.mjs start `
  --target-source <targetSourcePath> `
  --target-class <targetClass> `
  --test-project <testProjectPath> `
  [--scenario <userScenario> ...]

node .codex/scripts/dotnet-testing-codex-lite/workflow.mjs advance `
  --manifest <manifestPath>
```

成功stdout是唯一action JSON。每次agent回傳後，只以action提供的`manifestPath`呼叫一次
`advance`；driver command失敗時回報其compact error並停止，不自行修補state或改判結果。

Driver擁有唯一run namespace、test-project active lock、production／test hash lifecycle、
phase artifacts與terminal result。Main不直接呼叫leaf scripts，也不預先清除tests或run evidence。

## Action調度

依action type執行：

1. `dispatch_author`：以完整payload、`fork_turns: "none"`啟動
   `.codex/agents/dotnet-testing-lite-unit-author.toml`。
2. `dispatch_verifier`：以完整payload、`fork_turns: "none"`啟動
   `.codex/agents/dotnet-testing-lite-unit-verifier.toml`。
3. `dispatch_author_repair`：只對原Author送出follow-up。
4. `dispatch_verifier_final`：只對原Verifier送出follow-up。
5. `terminal`：停止action loop並交付driver結果。

每個dispatch action提供`payloadPath`，內容是driver已保存的完整payload。Main以raw text讀取
該檔，將讀取結果直接作為spawn／follow-up的message；不得從畫面重新抄寫payload、逐欄建立
物件、縮短或重組任何path。Code-mode應把讀取工具回傳的完整文字直接傳給派遣工具，不經
模型重新產生JSON。若讀取失敗或輸出遭截斷，停止派遣並回報錯誤，不自行補齊路徑。
`payloadPath`只供Main讀取；Author／Verifier收到的是完整內容，不是要求它們自行找檔的提示。

Main不解讀agent結果來決定下一phase；是否repair、是否terminal及多target同project的串行順序
都只依driver action。不同test project即使可並行，也不得混用run、agents、artifacts或額度。

## Environment stop

Agent若回報指定寫入受環境保護，Main只呼叫一次`advance`並接受driver的停止結果；不要求
agent改寫其他路徑、不派遣下一角色、不消耗repair，也不自行變更保護狀態。具體attempt、
integrity與stop artifact由deterministic gates驗證。

## Final handoff

Terminal action提供`resultPath`與`resultMarkdownPath`。兩者分開唯讀：`resultPath`只用來確認
machine result存在；`resultMarkdownPath`以raw text讀取並直接作為final response本文，例如
code-mode使用`text(markdownRead.output)`。除傳輸可能移除單一terminal newline外，不轉換、
摘要或重建內容。

繁中四區final與timing由driver renderer產生；完整machine truth保留在
`result.json`。Main只負責忠實交付，不要求agents撰寫固定句子。

Driver 的 machine result 不提供 token 估算或實際用量數字。Main 不得透過提示詞要求模型
補報數值，也不得依文字長度自行估算。支援的 Codex runtime 會在 driver gate 與測試判定之外
自動觀測用量；若 terminal Markdown 已包含用量網頁網址，Main 仍依上述規則逐字交付。
