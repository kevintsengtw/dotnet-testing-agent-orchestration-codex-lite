# Legacy and visibility boundaries

- 優先透過 public behavior測 private implementation。
- internal API 只有專案既有 `InternalsVisibleTo` 時直接測。
- static/global/file/time dependency 缺 seam 時寫 characterization test或回報 blocker。
- 不以 reflection 作預設策略。
- production refactor需使用者另外批准；Unit workflow不得自行修改。
