import type { AssetAmount, Money, Network, PaymentRequirements, Price, SchemeNetworkServer, SupportedKind } from "@x402/core/types";
import {
  STELLAR_TESTNET_USDC_CONTRACT,
  STELLAR_PUBNET_USDC_CONTRACT,
  getX402RuntimeConfig,
} from "@/server/x402/config";

const STELLAR_USDC_DECIMALS = 7;
const STELLAR_USDC_ASSET_SYMBOL = "USDC";

function getUsdcContractForNetwork(network: Network): string | undefined {
  const config = getX402RuntimeConfig();

  if (network === "stellar:testnet") {
    return config.stellarUsdcContract || STELLAR_TESTNET_USDC_CONTRACT;
  }
  if (network === "stellar:pubnet") {
    return config.stellarPubnetUsdcContract || STELLAR_PUBNET_USDC_CONTRACT;
  }

  return undefined;
}

/**
 * Server-side Stellar x402 scheme implementing SchemeNetworkServer.
 */
export class StellarExactScheme implements SchemeNetworkServer {
  readonly scheme = "exact";

  /**
   * Returns the decimal precision of Stellar USDC.
   */
  getAssetDecimals(_asset: string, _network: Network): number {
    void _asset;
    void _network;
    return STELLAR_USDC_DECIMALS;
  }

  /**
   * Converts a user-facing price representation into a Stellar USDC AssetAmount.
   */
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    if (typeof price === "object" && price !== null && "asset" in price && "amount" in price) {
      return price as AssetAmount;
    }

    const contract = getUsdcContractForNetwork(network);

    if (!contract) {
      throw new Error(`Stellar USDC contract not configured for network ${network}`);
    }

    const decimal = this.parseMoneyToDecimal(price);
    const atomicAmount = BigInt(Math.round(decimal * 10 ** STELLAR_USDC_DECIMALS)).toString();

    return {
      asset: contract,
      amount: atomicAmount,
      extra: {
        symbol: STELLAR_USDC_ASSET_SYMBOL,
        decimals: STELLAR_USDC_DECIMALS,
      },
    };
  }

  /**
   * Enriches payment requirements with Stellar-specific contract metadata.
   */
  async enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    _supportedKind: SupportedKind,
    _facilitatorExtensions: string[],
  ): Promise<PaymentRequirements> {
    void _supportedKind;
    void _facilitatorExtensions;
    const contract = getUsdcContractForNetwork(paymentRequirements.network);

    return {
      ...paymentRequirements,
      extra: {
        ...paymentRequirements.extra,
        assetContract: contract,
        assetCode: STELLAR_USDC_ASSET_SYMBOL,
        assetDecimals: STELLAR_USDC_DECIMALS,
      },
    };
  }

  private parseMoneyToDecimal(money: Money): number {
    if (typeof money === "number") {
      return money;
    }

    const cleaned = money.replace(/^\$/, "").trim();

    if (cleaned === "") {
      throw new Error(`Cannot parse empty money string: "${money}"`);
    }

    const parsed = Number(cleaned);

    if (!Number.isFinite(parsed)) {
      throw new Error(`Cannot parse money string as number: "${money}"`);
    }

    return parsed;
  }
}
