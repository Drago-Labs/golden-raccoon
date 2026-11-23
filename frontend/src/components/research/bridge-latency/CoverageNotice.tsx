export function CoverageNotice({ notes }: { notes: string[] }) {
  return <section role="status"><h2 className="font-medium">Coverage</h2><ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul></section>;
}
