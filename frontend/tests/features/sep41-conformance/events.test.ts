import { describe, expect, it } from "vitest";
import { validateEventShapes } from "@/server/research/sep41-conformance/eventShapes";
import { normalizeSampledEvent } from "@/server/research/sep41-conformance/eventSampler";
import { fixtures } from "./fixtures";

function samplesFrom(fixture: typeof fixtures.conforming) {
  return (fixture.events ?? [])
    .map((event, index) =>
      normalizeSampledEvent(
        { id: event.id, ledger: event.ledger, topics: event.topics, data: event.data },
        index,
      ),
    )
    .filter((event): event is NonNullable<typeof event> => event !== null);
}

describe("sep41 eventShapes", () => {
  it("accepts conforming event topic and data shapes", () => {
    const findings = validateEventShapes(samplesFrom(fixtures.conforming));
    const failures = findings.filter((finding) => !finding.ok);
    expect(failures).toEqual([]);
  });

  it("names the topic or field that differs for wrong shapes", () => {
    const findings = validateEventShapes(samplesFrom(fixtures.wrongEvents));
    const transfer = findings.find((finding) => finding.sampleId === "evt-bad-transfer");
    const approve = findings.find((finding) => finding.sampleId === "evt-bad-approve");

    expect(transfer?.ok).toBe(false);
    expect(transfer?.mismatchedField).toBe("topic[2]");
    expect(approve?.ok).toBe(false);
    expect(approve?.mismatchedField).toBe("data.live_until_ledger");
  });
});
