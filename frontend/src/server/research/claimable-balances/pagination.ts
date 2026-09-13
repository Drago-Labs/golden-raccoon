export function nextCursor(records: { paging_token?: string }[], seen: Set<string>) {
  const cursor = records.at(-1)?.paging_token;
  if (!cursor) return { cursor: null, duplicate: false };
  if (seen.has(cursor)) return { cursor: null, duplicate: true };
  seen.add(cursor); return { cursor, duplicate: false };
}
