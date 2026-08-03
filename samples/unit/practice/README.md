# Unit practice matrix

保留三個相同練習集合：

- `Practice.Core.Net8` / `Practice.Core.Net8.Tests`
- `Practice.Core` / `Practice.Core.Tests`（net9.0）
- `Practice.Core.Net10` / `Practice.Core.Net10.Tests`

`src/` 是 production fixture；`tests/` 只保留空白csproj。workflow產生的tests、coverage與csproj暫時修改不得commit。

建議targets依序為：

1. `TemperatureConverter`
2. `WeatherAlertService`
3. `EmployeeService`
4. `SubscriptionService`
5. `OrderProcessingService`
6. `OrderValidator`
7. `ReportGenerator`
