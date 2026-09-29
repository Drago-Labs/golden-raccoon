# Regional news coverage

Separate evidence workspace for bounded regional feeds. Configured sources are
not treated as successful fetches. Original-language titles and summaries stay
beside every translation, with translator version, confidence, and manual-review
flags. Ticker mentions alone never become asset references; chain + contract or
issuer evidence is required. Syndication duplicates are not counted as
independent regional coverage. Failed sources lower coverage and never create
fabricated articles or score changes (`scoreUnchanged: true`).

Run: `npx vitest run tests/features/regional-news`
