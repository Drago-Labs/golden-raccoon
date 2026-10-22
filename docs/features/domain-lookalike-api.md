# Domain look-alike API

`POST /api/insights/domain-lookalike` accepts `url`, at least one `officialDomains` entry, and an optional `stellarTomlUrl`. It returns normalised hostnames, closest-domain distance, character differences, homoglyph explanations, source-labelled external signals, a verdict, and `readOnly: true`.

Responses are `no-store`. Invalid or non-HTTP(S) input returns 400 and oversized requests return 413.
