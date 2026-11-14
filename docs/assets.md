# Stellar Asset & Stablecoin Detection (`OC-008`)

## Overview

In Stellar, any account can issue an asset with an arbitrary `assetCode` (such as `USDC`). Therefore, **asset identity is always defined by the pair `(assetCode, assetIssuer)`**, never by `assetCode` alone.

The `src/assets/` module (`stellar-assets.ts` and `asset-detector.ts`) provides read-only helpers to classify native `XLM`, verified stablecoins, and unverified issued tokens without merging distinct issuers.

## Key Helpers

- `detectStellarAsset(input, registry?)`: Inspects a `NormalizedOnchainTransaction` or `RawPayment` and returns a `DetectedStellarAsset` containing:
  - `assetCode` and `assetIssuer` (omitted for native `XLM`)
  - `assetKey`: Canonical `"XLM:native"` or `"<assetCode>:<assetIssuer>"`
  - `kind`: `"native" | "stablecoin" | "issued"`
  - `isVerifiedStablecoin`: `true` only when `(assetCode, assetIssuer)` matches `KNOWN_STELLAR_STABLECOINS`
  - `isUnverifiedStablecoinCode`: `true` when an asset uses a stablecoin ticker (e.g. `USDC`) from an unverified issuer
  - `defaultFinanceCategory`: Readable finance label (`"Income"`, `"Expense"`, `"Transfer"`, `"Fee"`, or `"Unknown"`)
- `isNativeAsset(input)` / `isIssuedAsset(input)`: Boolean guards for separating native `XLM` fees/transfers from issued tokens.
- `formatAssetKey(assetCode, assetIssuer?)`: Validates the issuer G-address for non-native assets and returns the canonical composite key.
