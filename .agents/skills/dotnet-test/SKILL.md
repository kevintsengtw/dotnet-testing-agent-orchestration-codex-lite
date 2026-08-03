---
name: dotnet-test
description: Build-first 執行 xUnit、收集 Cobertura並產生 target-scoped coverage manifest。
---

# dotnet-test

正式 workflow一律使用 repo script：

```bash
node .codex/scripts/run-unit-coverage.mjs \
  --test-project <tests.csproj> \
  --target-source <source.cs> \
  --target-class <ClassName> \
  --output <coverage.json> \
  --production-baseline <baseline.json>
```

Script 固定：

1. `dotnet build <project> --verbosity minimal`，保留 compact warning evidence
2. `dotnet test <project> --no-build --collect:"XPlat Code Coverage"`
3. 找出 Cobertura XML
4. 只彙整指定 target class/source 的 line與branch
5. 輸出 compact JSON
6. 核對 Author 前 capture 的 production baseline

規則：

- build失敗不得執行舊 binary tests。
- 不以 filtered pass取代完整 test project pass；`--filter` 只供診斷。
- 最多兩輪 test-only修正。
- 不升降既有 package；不得修改 production。
- coverage低於目標不是 build/test failure，但必須產生 gap manifest。
- 記錄 build/test/總 duration 與 warning count/codes；不得用 `WarningLevel=0` 隱藏。
- production integrity failure 一律失敗。
- 不把完整 CLI output放進 agent回覆；失敗時只保留尾端摘要。
