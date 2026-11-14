export type StellarAssetKind = "native" | "stablecoin" | "issued";

export type KnownStablecoinMetadata = {
  assetCode: string;
  assetIssuer: string;
  network: "public" | "testnet";
  fiatPeg: "USD" | "EUR" | "NGN";
  issuerLabel: string;
};

/**
 * Curated registry of verified Stellar stablecoins keyed by exact `(assetCode, assetIssuer)`.
 * An asset code alone (e.g. `"USDC"`) never qualifies as a verified stablecoin unless
 * its `assetIssuer` also matches a known issuer entry or caller-supplied allowlist.
 */
export const KNOWN_STELLAR_STABLECOINS: readonly KnownStablecoinMetadata[] = [
  {
    assetCode: "USDC",
    assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVV",
    network: "public",
    fiatPeg: "USD",
    issuerLabel: "Circle (Mainnet)",
  },
  {
    assetCode: "USDC",
    assetIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    network: "testnet",
    fiatPeg: "USD",
    issuerLabel: "Circle (Testnet)",
  },
  {
    assetCode: "USDC",
    assetIssuer: "GABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQHGPC",
    network: "testnet",
    fiatPeg: "USD",
    issuerLabel: "Synthetic Fixture USDC Issuer",
  },
  {
    assetCode: "EURC",
    assetIssuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2",
    network: "public",
    fiatPeg: "EUR",
    issuerLabel: "Circle EURC (Mainnet)",
  },
];
