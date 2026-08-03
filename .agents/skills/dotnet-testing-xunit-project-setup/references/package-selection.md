# Unit Test 套件選擇

先沿用 repository 既有版本與中央套件管理。只有缺少完成目標所需能力時才加入套件，不因範例版本較新而升級。

| 套件 | 放置位置 | 加入條件 |
|---|---|---|
| `Microsoft.NET.Test.Sdk` | test project | 所有 xUnit test projects |
| `xunit` | test project | 所有 xUnit test projects |
| `xunit.runner.visualstudio` | test project，`PrivateAssets=all` | IDE/CLI discovery |
| `coverlet.collector` | test project，`PrivateAssets=all` | XPlat Code Coverage |
| `AwesomeAssertions` | test project，建議 `PrivateAssets=all` | lite workflow 預設 assertions |
| `NSubstitute` | test project | SUT 有 interface/virtual dependency 或需要 interaction verification |
| `AutoFixture` | test project | 複雜 object graph；重要 boundaries 仍手動指定 |
| `AutoFixture.Xunit2` | test project | 需要 `[AutoData]`/composite data attributes |
| `AutoFixture.AutoNSubstitute` | test project | 同時使用 AutoFixture 與 NSubstitute |
| `Microsoft.Extensions.TimeProvider.Testing` | test project | production 注入 `TimeProvider`，測試使用 `FakeTimeProvider` |
| `System.IO.Abstractions` | production project | production 以 `IFileSystem` 取代靜態 `File`/`Directory` |
| `System.IO.Abstractions.TestingHelpers` | test project | 測試使用 `MockFileSystem`/`MockFileData` |
| `FluentValidation` | production 與 test project | production validator 與 `FluentValidation.TestHelper` |

## 最小決策

1. 若 test project 已有可用 assertion/mock library，沿用並在 author result 記錄，不為風格偏好新增套件。
2. 若新建 lite test project，加入 xUnit 基礎四件、AwesomeAssertions；SUT 有 dependency 時再加入 NSubstitute。
3. TimeProvider、filesystem、FluentValidation 與 AutoFixture 都按 source 特徵加入。
4. `FluentValidation.TestHelper` 是 `FluentValidation` 套件的 namespace/API，不是獨立 NuGet package。
5. 不加入 Bogus。
