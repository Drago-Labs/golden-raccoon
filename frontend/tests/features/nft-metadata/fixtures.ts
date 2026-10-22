import { encodeFunctionResult, type Hex } from "viem";
import { METADATA_UPDATE_TOPICS } from "@/server/research/nft-metadata/mutability";
import { INTERFACE_IDS } from "@/server/research/nft-metadata/standardDetection";
import type { NftLog, NftRpc } from "@/server/research/nft-metadata/uriReader";

if (!window.localStorage) Object.defineProperty(window, "localStorage", { value: { clear() {} } });

export const wallet = "0x9999999999999999999999999999999999999999";
export const contractAddress = "0x1111111111111111111111111111111111111111";
export const ownerAddress = "0x3333333333333333333333333333333333333333";

const SELECTORS = {
  supportsInterface: "0x01ffc9a7",
  tokenURI: "0xc87b56dd",
  uri: "0x0e89341c",
  contractURI: "0xe8a3d485",
  owner: "0x8da5cb5b",
  metadataFrozen: "0xfb3cc6c2",
  frozen: "0x054f7d9c",
  isFrozen: "0x33eeb147",
  setBaseURI: "0x55f804b3",
  setURI: "0x02fe5305",
  setTokenURI: "0x162094c4",
} as const;

const boolAbi = [{ type: "function", name: "f", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] }] as const;
const stringAbi = [{ type: "function", name: "f", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }] as const;
const addressAbi = [{ type: "function", name: "f", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;

function boolResult(value: boolean): Hex {
  return encodeFunctionResult({ abi: boolAbi, functionName: "f", result: value });
}
function stringResult(value: string): Hex {
  return encodeFunctionResult({ abi: stringAbi, functionName: "f", result: value });
}
function addressResult(value: string): Hex {
  return encodeFunctionResult({ abi: addressAbi, functionName: "f", result: value as Hex });
}

export type FreezeFlagName = "metadataFrozen" | "frozen" | "isFrozen";
export type SetterName = "setBaseURI(string)" | "setURI(string)" | "setTokenURI(uint256,string)";

export type NftFixtureOptions = {
  blockNumber?: bigint;
  /** Simulates the provider being unreachable entirely. */
  failBlockNumber?: boolean;
  standard?: "erc721" | "erc1155" | "unknown";
  erc721MetadataExtension?: boolean;
  erc4906?: boolean;
  contractUri?: string | null;
  tokenUriFor?: Record<string, string | null>;
  owner?: string | null;
  freezeFlags?: Partial<Record<FreezeFlagName, boolean>>;
  setterRevertReasons?: Partial<Record<SetterName, string>>;
  metadataUpdateLogCount?: number;
  batchMetadataUpdateLogCount?: number;
};

function makeLog(topic: string, index: number): NftLog {
  return { address: contractAddress, topics: [topic], data: "0x", blockNumber: BigInt(90 + index), transactionHash: `0xlog${index}` };
}

/** A programmable fake `NftRpc` driven by scenario options rather than a fixed response table. */
export function nftReader(options: NftFixtureOptions = {}): NftRpc {
  const standard = options.standard ?? "erc721";
  const tokenUriFor = options.tokenUriFor ?? {};
  const setterRevertReasons = options.setterRevertReasons ?? {};
  const freezeFlags = options.freezeFlags ?? {};

  return {
    async blockNumber() {
      if (options.failBlockNumber) throw new Error("Provider request failed");
      return options.blockNumber ?? 100n;
    },
    async call(_to, data) {
      const selector = data.slice(0, 10);

      if (selector === SELECTORS.supportsInterface) {
        const interfaceId = `0x${data.slice(10, 18)}`;
        if (standard === "unknown") return null;
        const supported =
          (standard === "erc721" && interfaceId === INTERFACE_IDS.erc721) ||
          (standard === "erc1155" && interfaceId === INTERFACE_IDS.erc1155) ||
          (standard === "erc721" && interfaceId === INTERFACE_IDS.erc721Metadata && Boolean(options.erc721MetadataExtension)) ||
          (standard === "erc1155" && interfaceId === INTERFACE_IDS.erc1155MetadataUri && Boolean(options.erc721MetadataExtension)) ||
          (interfaceId === INTERFACE_IDS.erc4906 && Boolean(options.erc4906));
        if (
          interfaceId === INTERFACE_IDS.erc721 ||
          interfaceId === INTERFACE_IDS.erc1155 ||
          interfaceId === INTERFACE_IDS.erc721Metadata ||
          interfaceId === INTERFACE_IDS.erc1155MetadataUri ||
          interfaceId === INTERFACE_IDS.erc4906
        ) {
          return boolResult(supported);
        }
        return boolResult(false);
      }

      if (selector === SELECTORS.tokenURI || selector === SELECTORS.uri) {
        const tokenId = BigInt(`0x${data.slice(10, 74)}`).toString();
        const uri = tokenUriFor[tokenId];
        return uri === undefined || uri === null ? null : stringResult(uri);
      }

      if (selector === SELECTORS.contractURI) {
        return options.contractUri ? stringResult(options.contractUri) : null;
      }

      if (selector === SELECTORS.owner) {
        return options.owner ? addressResult(options.owner) : null;
      }

      if (selector === SELECTORS.metadataFrozen) {
        return freezeFlags.metadataFrozen === undefined ? null : boolResult(freezeFlags.metadataFrozen);
      }
      if (selector === SELECTORS.frozen) {
        return freezeFlags.frozen === undefined ? null : boolResult(freezeFlags.frozen);
      }
      if (selector === SELECTORS.isFrozen) {
        return freezeFlags.isFrozen === undefined ? null : boolResult(freezeFlags.isFrozen);
      }

      return null;
    },
    async probeRevertReason(_to, data) {
      const selector = data.slice(0, 10);
      if (selector === SELECTORS.setBaseURI) return setterRevertReasons["setBaseURI(string)"] ?? null;
      if (selector === SELECTORS.setURI) return setterRevertReasons["setURI(string)"] ?? null;
      if (selector === SELECTORS.setTokenURI) return setterRevertReasons["setTokenURI(uint256,string)"] ?? null;
      return null;
    },
    async getLogs({ topics }) {
      if (topics[0] === METADATA_UPDATE_TOPICS.metadataUpdate) {
        return Array.from({ length: options.metadataUpdateLogCount ?? 0 }, (_, index) => makeLog(METADATA_UPDATE_TOPICS.metadataUpdate, index));
      }
      if (topics[0] === METADATA_UPDATE_TOPICS.batchMetadataUpdate) {
        return Array.from({ length: options.batchMetadataUpdateLogCount ?? 0 }, (_, index) =>
          makeLog(METADATA_UPDATE_TOPICS.batchMetadataUpdate, index),
        );
      }
      return [];
    },
  };
}

/** JSON-safe mirror of `NftFixtureOptions` (bigints as decimal strings) for recorded `data/*.json` scenarios. */
export type JsonNftFixture = Omit<NftFixtureOptions, "blockNumber"> & { blockNumber?: string };

export function recordedNftRpc(fixture: JsonNftFixture): NftRpc {
  return nftReader({ ...fixture, blockNumber: fixture.blockNumber !== undefined ? BigInt(fixture.blockNumber) : undefined });
}
