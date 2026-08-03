---
name: dotnet-testing-unit-patterns
description: Unit Author 的補充配方索引，處理 AutoFixture 複雜資料及 legacy/internal seam；validator、時間與 filesystem 使用各自完整 skill。
---

# Conditional Unit Patterns

只選匹配 target 的 reference；不要全部載入。

| Target 特徵 | Reference |
| --- | --- |
| 複雜資料、AutoFixture | `references/data-generation.md` |
| internal/private、legacy seam | `references/legacy-boundaries.md` |

FluentValidation、TimeProvider 與 System.IO.Abstractions 不使用此處摘要，必須載入對應的完整 skill。
