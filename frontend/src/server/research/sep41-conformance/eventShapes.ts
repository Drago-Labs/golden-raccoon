import { SEP41_REFERENCE_EVENTS } from "./referenceInterface";
import type { EventShapeFinding, SampledEvent } from "./schema";

/**
 * Validates sampled events against SEP-41 topic and data shapes.
 * When a shape fails, `mismatchedField` names the topic index or data key that differed.
 */
export function validateEventShapes(samples: SampledEvent[]): EventShapeFinding[] {
  const findings: EventShapeFinding[] = [];
  const byName = new Map<string, SampledEvent[]>();

  for (const sample of samples) {
    const bucket = byName.get(sample.topicName) ?? [];
    bucket.push(sample);
    byName.set(sample.topicName, bucket);
  }

  for (const reference of SEP41_REFERENCE_EVENTS) {
    const matched = byName.get(reference.name) ?? [];
    if (matched.length === 0) {
      findings.push({
        eventName: reference.name,
        sampleId: null,
        ok: true,
        mismatchedField: null,
        detail: `No ${reference.name} events were sampled; absence is not treated as a failure.`,
      });
      continue;
    }

    for (const sample of matched) {
      const expectedTopicCount = 1 + reference.topicRoles.length;
      if (sample.topics.length < expectedTopicCount) {
        findings.push({
          eventName: reference.name,
          sampleId: sample.id,
          ok: false,
          mismatchedField: `topic[${sample.topics.length}]`,
          detail: `Expected topics ["${reference.name}", ${reference.topicRoles.map((r) => `<${r}>`).join(", ")}] but got ${sample.topics.length} topic(s)`,
        });
        continue;
      }

      if (sample.topics[0] !== reference.name) {
        findings.push({
          eventName: reference.name,
          sampleId: sample.id,
          ok: false,
          mismatchedField: "topic[0]",
          detail: `Expected topic[0]="${reference.name}" got "${sample.topics[0]}"`,
        });
        continue;
      }

      let dataOk = false;
      let mismatchedField: string | null = null;
      let detail = "";

      if (reference.dataFormats.includes("i128") && sample.dataKind === "i128") {
        dataOk = true;
        detail = "Data matches single-value i128 format";
      } else if (reference.dataFormats.includes("vec_i128_u32") && sample.dataKind === "vec") {
        dataOk = true;
        detail = "Data matches vec [i128, u32] format";
      } else if (reference.dataFormats.includes("map") && sample.dataKind === "map") {
        const missingKey = reference.requiredMapKeys.find((key) => !sample.dataKeys.includes(key));
        if (missingKey) {
          dataOk = false;
          mismatchedField = `data.${missingKey}`;
          detail = `Map data missing required key "${missingKey}"`;
        } else {
          dataOk = true;
          detail = "Data matches map format with required keys";
        }
      } else if (sample.dataKind === "empty") {
        dataOk = false;
        mismatchedField = "data";
        detail = "Event data was empty";
      } else {
        dataOk = false;
        mismatchedField = "data";
        detail = `Unexpected data kind "${sample.dataKind}" for ${reference.name}; accepted formats: ${reference.dataFormats.join(", ")}`;
      }

      findings.push({
        eventName: reference.name,
        sampleId: sample.id,
        ok: dataOk,
        mismatchedField,
        detail,
      });
    }
  }

  return findings;
}
