# POST /api/insights/frontend-integrity

```json
{
  "domain": "app.example",
  "html": "<script src=\"https://app.example/app.js\" integrity=\"sha256-abc\"></script>",
  "headers": { "content-security-policy": "default-src 'self'", "strict-transport-security": "max-age=1", "x-frame-options": "DENY", "referrer-policy": "no-referrer" },
  "previousHtml": "<script src=\"https://app.example/old.js\"></script>"
}
```

Ready response: `{ "kind": "ready", "report": { "domain", "current", "previous", "diff", "findings", "coverage" } }`.

`diff.added` and `diff.removed` are scripts keyed by sha256. `findings[].kind` is `missing_integrity` or `new_third_party`.

`400` for invalid JSON. `413` above `maxRequestBytes`. `Cache-Control: no-store`.
