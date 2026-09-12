/**
 * Fixtures for coordinated-activity pattern analysis.
 *
 * Every author key here is an opaque placeholder. No fixture carries a real
 * handle, a real person, or anything that is not obviously synthetic, and
 * nothing touches a network or a paid API.
 */
import type { CoordinationRequest } from "@/server/research/social-coordination/schema";

const OBSERVED_AT = "2026-01-05T12:00:00.000Z";

const COPY = "Do not miss this token it is going to run hard today get in before the listing";
const ORGANIC = [
  "The listing announcement explains the vesting schedule in more detail than the earlier post did",
  "Anyone know whether the vesting cliff applies to the team allocation or only to the treasury",
  "Reading the docs now, the cliff looks like twelve months with monthly unlocks after that",
  "The audit report is linked from the docs page, published two weeks before the listing",
  "Worth noting the audit only covers the vault contract and not the router they added later",
  "Volume looks normal compared to the last two listings on the same venue this quarter",
  "Liquidity is thinner than the announcement implied, roughly a third of what was promised",
  "The team answered the vesting question in their channel, screenshot is in the thread above",
  "That screenshot is from the previous announcement, the numbers changed in the final version",
  "Comparing both versions, the treasury allocation went up and the community share went down",
  "Someone should ask whether the router contract will be audited before the next phase begins",
  "They said the router audit is scheduled but did not commit to publishing it before launch",
];

function at(minute: number): string {
  return `2026-01-05T10:${String(minute).padStart(2, "0")}:00.000Z`;
}

/**
 * Forty identical messages from four accounts inside ninety seconds, against a
 * quiet baseline. The clearest possible repetition signal.
 */
export const synchronizedCopyBurst: CoordinationRequest = {
  observedAt: OBSERVED_AT,
  sampleIsExhaustive: true,
  observations: [
    ...ORGANIC.map((text, index) => ({
      observationId: `baseline-${index}`,
      authorKey: `account-baseline-${index}`,
      postedAt: at(index),
      text,
    })),
    ...Array.from({ length: 40 }, (_, index) => ({
      observationId: `burst-${index}`,
      authorKey: `account-burst-${index % 4}`,
      postedAt: `2026-01-05T10:30:${String(index % 60).padStart(2, "0")}.000Z`,
      text: COPY,
    })),
  ],
};

/**
 * A genuine spike: many accounts reacting to one event in their own words. The
 * burst window is present, but there is no repeated-text cluster behind it.
 */
export const organicSpike: CoordinationRequest = {
  observedAt: OBSERVED_AT,
  sampleIsExhaustive: true,
  observations: [
    ...ORGANIC.map((text, index) => ({
      observationId: `organic-early-${index}`,
      authorKey: `account-organic-${index}`,
      postedAt: at(index),
      text,
    })),
    ...ORGANIC.map((text, index) => ({
      observationId: `organic-spike-${index}`,
      authorKey: `account-spike-${index}`,
      postedAt: `2026-01-05T10:30:${String(index * 4).padStart(2, "0")}.000Z`,
      text: `${text} and this changes how I read the earlier thread entirely`,
    })),
  ],
};

/** Four observations from two accounts: below every published minimum. */
export const sparseSample: CoordinationRequest = {
  observedAt: OBSERVED_AT,
  sampleIsExhaustive: false,
  observations: [
    { observationId: "sparse-1", authorKey: "account-a", postedAt: at(1), text: COPY },
    { observationId: "sparse-2", authorKey: "account-a", postedAt: at(2), text: COPY },
    { observationId: "sparse-3", authorKey: "account-b", postedAt: at(3), text: COPY },
    { observationId: "sparse-4", authorKey: "account-b", postedAt: at(4), text: COPY },
  ],
};

/**
 * Duplicated observation ids from one account, malformed timestamps, markup,
 * bidirectional-override characters, and an empty message.
 */
export const duplicatesMalformedHostile: CoordinationRequest = {
  observedAt: OBSERVED_AT,
  sampleIsExhaustive: false,
  observations: [
    ...Array.from({ length: 14 }, (_, index) => ({
      observationId: `repeat-${index}`,
      authorKey: "account-prolific",
      postedAt: at(index),
      text: COPY,
    })),
    ...ORGANIC.slice(0, 6).map((text, index) => ({
      observationId: `mixed-${index}`,
      authorKey: `account-mixed-${index}`,
      postedAt: at(20 + index),
      text,
    })),
    {
      observationId: "no-timestamp",
      authorKey: "account-undated",
      text: "This message carries no timestamp at all and must not be placed on the timeline",
    },
    {
      observationId: "hostile-markup",
      authorKey: "account-hostile",
      postedAt: at(30),
      text: "<script>alert(1)</script>Check\u202Ethis\u202C out right now before the listing closes for good",
    },
    { observationId: "empty-text", authorKey: "account-empty", postedAt: at(31), text: "   " },
  ],
};

/** Valid request carrying no observations. */
export const emptySample: CoordinationRequest = {
  observedAt: OBSERVED_AT,
  sampleIsExhaustive: false,
  observations: [],
};

/** The copy burst with its observation order reversed. */
export const reversedOrder: CoordinationRequest = {
  ...synchronizedCopyBurst,
  observations: [...synchronizedCopyBurst.observations].reverse(),
};
