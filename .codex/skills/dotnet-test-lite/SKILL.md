---
name: dotnet-test-lite
description: Build-first 執行 xUnit、收集 Cobertura並產生 target-scoped coverage manifest。
---

# dotnet-test-lite

正式 workflow 一律從已部署資產的專案根目錄執行 runner：

```bash
node .codex/scripts/dotnet-testing-lite/run-coverage.mjs \
  --test-project <tests.csproj> \
  --target-source <source.cs> \
  --target-class <ClassName> \
  --output <coverage.json> \
  --production-baseline <baseline.json>
```

Script 固定：

1. `dotnet build <project> --no-incremental --verbosity minimal`，保留 compact warning evidence
2. `dotnet test <project> --no-build --verbosity minimal --collect:"XPlat Code Coverage"`，另指定獨立 results directory 與 TRX logger
3. 找出 Cobertura XML
4. 只彙整指定 target class/source 的 line與branch
5. 輸出 compact JSON
6. 核對 Author 前 capture 的 production baseline

`--output` 與對應的 `.raw` evidence 目錄必須尚不存在。正式 workflow 必須傳入
`--production-baseline`；CLI 雖允許省略，省略時只會記錄 `not_checked`。
Line／branch 門檻預設各為 100，可用 `--line-threshold`／`--branch-threshold` 指定。

規則：

- build失敗不得執行舊 binary tests。
- Runner 固定執行完整 test project，不接受 `--filter`；另外執行的篩選測試只供診斷。
- 修正額度遵循 Lite workflow driver 的每 target 最多一次 repair。
- 不升降既有 package；不得修改 production。
- coverage低於目標不是 build/test failure，但必須產生 gap manifest。
- 記錄 build/test/總 duration 與 warning count/codes；不得用 `WarningLevel=0` 隱藏。
- production integrity failure 一律失敗。
- 不把完整 CLI output放進 agent回覆；失敗時只保留尾端摘要。
