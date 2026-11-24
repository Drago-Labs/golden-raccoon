# Oracle heartbeat and staleness method

Feeds are discovered from configured addresses and supported consumer storage layouts, then deduplicated by address. Consecutive update timestamps form gaps. A gap is late only when it exceeds the configured heartbeat; time past heartbeat sums only the excess. Heartbeat-unknown feeds keep all gap classifications `unknown` rather than inheriting a default. Verified consumer source is scanned for explicit update-time checks and findings cite the source file and line.
