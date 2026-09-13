/**
 * Public entry point for proxy implementation and upgrade authority inspection.
 *
 * `inspectProxy` takes a reader as data. That is what makes the feature
 * testable without a chain, and it is also what makes the read-only guarantee
 * checkable: the only capability the service is handed is `ChainReader`, which
 * has no way to send a transaction.
 *
 * The read budget is enforced here rather than in each module, so the ceiling
 * published in `PROXY_LIMITS.maxRpcCalls` holds for the inspection as a whole
 * and not per module.
 */
import { collectAuthorityEvidence } from "./authorityEvidence";
import { buildCoverage, buildFindings, classify, type ClassificationInput } from "./classification";
import { readCode } from "./codeReader";
import { walkImplementationGraph } from "./implementationGraph";
import { readStandardSlots } from "./storageReader";
import { getEvmNetwork } from "@/lib/evm/config";
import {
  PROXY_LIMITS,
  PROXY_SCHEMA_VERSION,
  ProxyInspectorError,
  proxyInspectionRequestSchema,
  type ChainReader,
  type ProxyInspectionReport,
  type ScopedAddress,
} from "./schema";

class ReadBudgetExceeded extends Error {
  constructor(budget: number) {
    super(`The inspection reached its published ceiling of ${budget} reads.`);
    this.name = "ReadBudgetExceeded";
  }
}

type BudgetedReader = {
  reader: ChainReader;
  used: () => number;
  failed: () => number;
};

/**
 * Wraps a reader so the whole inspection shares one read budget.
 *
 * Once the budget is spent every further read rejects. Callers already treat a
 * rejected read as an unavailable observation, so exhausting the budget
 * degrades the report to partial instead of throwing the work away.
 */
function budgeted(reader: ChainReader, budget: number): BudgetedReader {
  let used = 0;
  let failed = 0;

  async function spend<T>(run: () => Promise<T>): Promise<T> {
    if (used >= budget) {
      failed += 1;
      throw new ReadBudgetExceeded(budget);
    }

    used += 1;

    try {
      return await run();
    } catch (error) {
      failed += 1;
      throw error;
    }
  }

  return {
    reader: {
      getBlockNumber: () => spend(() => reader.getBlockNumber()),
      getCode: (address, block) => spend(() => reader.getCode(address, block)),
      getStorageAt: (address, slot, block) => spend(() => reader.getStorageAt(address, slot, block)),
      call: (to, data, block) => spend(() => reader.call(to, data, block)),
    },
    used: () => used,
    failed: () => failed,
  };
}

function parseBlockNumber(block: string): number | null {
  if (!/^0x[0-9a-fA-F]+$/.test(block)) return null;

  const value = Number.parseInt(block.slice(2), 16);

  return Number.isSafeInteger(value) ? value : null;
}

export async function inspectProxy(input: unknown, reader: ChainReader): Promise<ProxyInspectionReport> {
  const parsed = proxyInspectionRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ProxyInspectorError("invalid_request", "The inspection request could not be read.", parsed.error.flatten());
  }

  const network = getEvmNetwork(parsed.data.network);

  if (!network) {
    // Refusing an unknown network is deliberate: an address rendered without a
    // known chain behind it is the exact ambiguity this feature exists to remove.
    throw new ProxyInspectorError("unsupported_network", "That network is not configured for EVM reads.", {
      network: parsed.data.network,
    });
  }

  const address = parsed.data.address.toLowerCase();
  const chainId = network.chainId ?? null;
  const target: ScopedAddress = { network: network.id, chainId, address };
  const budget = budgeted(reader, PROXY_LIMITS.maxRpcCalls);

  // Every read below uses this one block, so the report describes a single
  // consistent moment rather than a smear across several.
  let block = parsed.data.block;

  if (block === "latest") {
    try {
      block = await budget.reader.getBlockNumber();
    } catch {
      block = "latest";
    }
  }

  const targetCode = await readCode(budget.reader, target, block);

  if (targetCode.unavailableReason || !targetCode.hasCode) {
    const classificationInput: ClassificationInput = {
      targetCode,
      slots: [],
      path: [],
      authority: [],
      cycleDetected: false,
      truncated: false,
      failedReadCount: budget.failed(),
    };
    const { classification, summary } = classify(classificationInput);

    return {
      schemaVersion: PROXY_SCHEMA_VERSION,
      checkedAtBlock: block,
      checkedAtBlockNumber: parseBlockNumber(block),
      network: network.id,
      chainId,
      target,
      classification,
      summary,
      targetCode,
      slots: [],
      path: [],
      authority: [],
      findings: buildFindings(classificationInput, classification),
      coverage: buildCoverage(classificationInput, budget.used(), PROXY_LIMITS.maxRpcCalls),
      readOnly: true,
      scoreUnchanged: true,
    };
  }

  const slots = await readStandardSlots(budget.reader, address, block);

  const walk = await walkImplementationGraph({
    reader: budget.reader,
    network: network.id,
    chainId,
    target: address,
    block,
    rootSlots: slots,
  });

  const authority = await collectAuthorityEvidence({
    reader: budget.reader,
    network: network.id,
    chainId,
    block,
    slots,
  });

  const classificationInput: ClassificationInput = {
    targetCode,
    slots,
    path: walk.path,
    authority,
    cycleDetected: walk.cycleDetected,
    truncated: walk.truncated,
    failedReadCount: budget.failed(),
  };

  const { classification, summary } = classify(classificationInput);

  return {
    schemaVersion: PROXY_SCHEMA_VERSION,
    checkedAtBlock: block,
    checkedAtBlockNumber: parseBlockNumber(block),
    network: network.id,
    chainId,
    target,
    classification,
    summary,
    targetCode,
    slots,
    path: walk.path,
    authority,
    findings: buildFindings(classificationInput, classification),
    coverage: buildCoverage(classificationInput, budget.used(), PROXY_LIMITS.maxRpcCalls),
    readOnly: true,
    scoreUnchanged: true,
  };
}

export { ProxyInspectorError } from "./schema";
export type { ChainReader, ProxyInspectionReport } from "./schema";
