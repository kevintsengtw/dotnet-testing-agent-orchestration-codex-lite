# Complex test data

- AutoFixture只用於不重要欄位；重要 boundary 明確指定。
- recursion使用 omit/freeze customization，不建立失控 object graph。
- dependency 使用 Freeze/NSubstitute 時，確認被測物件取得同一 instance。
- 不用隨機資料測精確邊界。
