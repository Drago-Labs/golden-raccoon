export function CoverageNotice({notes}:{notes:string[]}) {
  return <aside className="rounded border p-4" aria-label="Evidence coverage"><h2 className="font-semibold">Evidence coverage</h2><ul className="list-inside list-disc text-sm">{notes.map(note=><li key={note}>{note}</li>)}</ul></aside>;
}
