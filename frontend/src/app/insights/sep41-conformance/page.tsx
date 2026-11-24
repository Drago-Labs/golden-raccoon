import { ConformanceReport } from "@/components/research/sep41-conformance/ConformanceReport";

export const metadata = {
  title: "SEP-41 token conformance",
  description:
    "Check whether a Soroban token contract exposes the SEP-41 interface and emits events in the expected shape.",
};

export default function Page() {
  return (
    <main className="mx-auto grid min-h-screen max-w-5xl gap-6 px-4 py-10">
      <ConformanceReport />
    </main>
  );
}
