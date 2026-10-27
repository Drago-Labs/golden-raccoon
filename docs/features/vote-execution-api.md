# Vote execution API

`POST /api/insights/vote-execution` accepts a proposal space and source URL, executor and RPC URL, and bounded `fromBlock`/`toBlock`. It returns classification rows containing proposal and execution evidence, reasons, coverage text, and `readOnly: true`.

Responses are `no-store`. Invalid or oversized ranges return 400, oversized request bodies return 413, and provider failure returns 503 without inferred matches.
