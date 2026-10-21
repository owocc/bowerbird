# Native message catalogs

`en.json` and `zh.json` are byte copies of `frontend/src/messages/*.json`, the
single source of user-facing copy the webview and the native renderer share.
`internal/nativeui/i18n_test.go` fails when they drift; refresh them with:

    cp frontend/src/messages/en.json internal/nativeui/messages/en.json
    cp frontend/src/messages/zh.json internal/nativeui/messages/zh.json

Native-only additions live in `native.json`, which overrides the base catalog
for keys under `native.*`; other languages can be added by dropping
`<code>.json` here and adding the code to `languageValues`.
