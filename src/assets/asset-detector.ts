import { ProcessingError } from "../errors.js";
import {
  requireAddress,
  type NormalizedOnchainTransaction,
  type RawPayment,
} from "../validation.js";
import {
  KNOWN_STELLAR_STABLECOINS,
  type KnownStablecoinMetadata,
  type StellarAssetKind,
} from "./stellar-assets.js";

export type DetectedStellarAsset = {
  assetCode: string;
  assetIssuer?: string;
  assetKey: string;
  kind: StellarAssetKind;
  isNative: boolean;
  isIssued: boolean;
  isVerifiedStablecoin: boolean;
  isUnverifiedStablecoinCode: boolean;
  stablecoinMetadata?: KnownStablecoinMetadata;
  defaultFinanceCategory: "Income" | "Expense" | "Transfer" | "Fee" | "Unknown";
};

const STABLECOIN_LIKE_CODES = new Set(["USDC", "USDT", "EURC", "PYUSD", "cNGN"]);

export function formatAssetKey(assetCode: string, assetIssuer?: string): string {
  if (assetCode === "XLM" && assetIssuer === undefined) {
    return "XLM:native";
  }
  if (!assetIssuer) {
    throw new ProcessingError(
      "INVALID_PAYMENT",
      "Non-native Stellar assets require an assetIssuer.",
    );
  }
  requireAddress(assetIssuer);
  return `${assetCode}:${assetIssuer}`;
}

export function isNativeAsset(input: {
  assetCode?: string;
  asset_type?: string;
  assetIssuer?: string | undefined;
  asset_issuer?: string | undefined;
}): boolean {
  if (input.asset_type === "native") {
    return true;
  }
  return (
    input.assetCode === "XLM" &&
    input.assetIssuer === undefined &&
    input.asset_issuer === undefined
  );
}

export function isIssuedAsset(input: {
  assetCode?: string;
  asset_type?: string;
  assetIssuer?: string | undefined;
  asset_issuer?: string | undefined;
}): boolean {
  return !isNativeAsset(input);
}

export function findKnownStablecoin(
  assetCode: string,
  assetIssuer?: string,
  registry: readonly KnownStablecoinMetadata[] = KNOWN_STELLAR_STABLECOINS,
): KnownStablecoinMetadata | undefined {
  if (!assetIssuer) {
    return undefined;
  }
  return registry.find(
    (entry) =>
      entry.assetCode === assetCode && entry.assetIssuer === assetIssuer,
  );
}

export function detectStellarAsset(
  input:
    | Pick<
        NormalizedOnchainTransaction,
        "assetCode" | "assetIssuer" | "type" | "direction"
      >
    | Pick<RawPayment, "asset_type"> & {
        asset_code?: string;
        asset_issuer?: string;
      },
  registry: readonly KnownStablecoinMetadata[] = KNOWN_STELLAR_STABLECOINS,
): DetectedStellarAsset {
  if ("asset_type" in input) {
    if (input.asset_type === "native") {
      return {
        assetCode: "XLM",
        assetKey: "XLM:native",
        kind: "native",
        isNative: true,
        isIssued: false,
        isVerifiedStablecoin: false,
        isUnverifiedStablecoinCode: false,
        defaultFinanceCategory: "Unknown",
      };
    }
    const code = input.asset_code ?? "";
    const issuer = input.asset_issuer;
    if (!code || !issuer) {
      throw new ProcessingError(
        "INVALID_PAYMENT",
        "Issued Stellar asset requires both asset_code and asset_issuer.",
      );
    }
    requireAddress(issuer);
    const stablecoin = findKnownStablecoin(code, issuer, registry);
    return {
      assetCode: code,
      assetIssuer: issuer,
      assetKey: formatAssetKey(code, issuer),
      kind: stablecoin ? "stablecoin" : "issued",
      isNative: false,
      isIssued: true,
      isVerifiedStablecoin: Boolean(stablecoin),
      isUnverifiedStablecoinCode:
        !stablecoin && STABLECOIN_LIKE_CODES.has(code.toUpperCase()),
      ...(stablecoin !== undefined ? { stablecoinMetadata: stablecoin } : {}),
      defaultFinanceCategory: "Unknown",
    };
  }

  const { assetCode, assetIssuer, type, direction } = input;
  const defaultFinanceCategory: DetectedStellarAsset["defaultFinanceCategory"] =
    type === "fee"
      ? "Fee"
      : type === "transfer" || direction === "internal"
        ? "Transfer"
        : type === "income"
          ? "Income"
          : type === "expense"
            ? "Expense"
            : "Unknown";

  if (assetCode === "XLM" && assetIssuer === undefined) {
    return {
      assetCode: "XLM",
      assetKey: "XLM:native",
      kind: "native",
      isNative: true,
      isIssued: false,
      isVerifiedStablecoin: false,
      isUnverifiedStablecoinCode: false,
      defaultFinanceCategory,
    };
  }

  if (!assetIssuer) {
    throw new ProcessingError(
      "INVALID_PAYMENT",
      "Issued Stellar asset requires assetIssuer.",
    );
  }
  requireAddress(assetIssuer);
  const stablecoin = findKnownStablecoin(assetCode, assetIssuer, registry);

  return {
    assetCode,
    assetIssuer,
    assetKey: formatAssetKey(assetCode, assetIssuer),
    kind: stablecoin ? "stablecoin" : "issued",
    isNative: false,
    isIssued: true,
    isVerifiedStablecoin: Boolean(stablecoin),
    isUnverifiedStablecoinCode:
      !stablecoin && STABLECOIN_LIKE_CODES.has(assetCode.toUpperCase()),
    ...(stablecoin !== undefined ? { stablecoinMetadata: stablecoin } : {}),
    defaultFinanceCategory,
  };
}
