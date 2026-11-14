import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { processStellarPayments, ProcessingError } from "../dist/index.js";
import {
  detectStellarAsset,
  formatAssetKey,
  isIssuedAsset,
  isNativeAsset,
} from "../dist/assets/asset-detector.js";

const fixture = JSON.parse(
  await readFile(new URL("./fixtures/payments.json", import.meta.url)),
);

test("OC-008: detectStellarAsset separates native XLM, verified stablecoins, and unverified lookalike issuers", () => {
  const { transactions } = processStellarPayments(fixture);

  const feeTx = transactions.find((t) => t.type === "fee");
  assert.ok(feeTx);
  const detectedFee = detectStellarAsset(feeTx);
  assert.equal(detectedFee.isNative, true);
  assert.equal(detectedFee.isIssued, false);
  assert.equal(detectedFee.kind, "native");
  assert.equal(detectedFee.assetKey, "XLM:native");
  assert.equal(detectedFee.defaultFinanceCategory, "Fee");

  const verifiedUsdcTx = transactions.find(
    (t) => t.assetIssuer === fixture.payments[0].asset_issuer,
  );
  assert.ok(verifiedUsdcTx);
  const detectedVerifiedUsdc = detectStellarAsset(verifiedUsdcTx);
  assert.equal(detectedVerifiedUsdc.isIssued, true);
  assert.equal(detectedVerifiedUsdc.isVerifiedStablecoin, true);
  assert.equal(detectedVerifiedUsdc.isUnverifiedStablecoinCode, false);
  assert.equal(detectedVerifiedUsdc.kind, "stablecoin");
  assert.equal(detectedVerifiedUsdc.defaultFinanceCategory, "Unknown");

  const lookalikeUsdcTx = transactions.find(
    (t) => t.assetIssuer === fixture.payments[3].asset_issuer,
  );
  assert.ok(lookalikeUsdcTx);
  const detectedLookalike = detectStellarAsset(lookalikeUsdcTx);
  assert.equal(detectedLookalike.isIssued, true);
  assert.equal(detectedLookalike.isVerifiedStablecoin, false);
  assert.equal(detectedLookalike.isUnverifiedStablecoinCode, true);
  assert.equal(detectedLookalike.kind, "issued");
  assert.equal(detectedLookalike.defaultFinanceCategory, "Transfer");
});

test("OC-008: asset helpers preserve assetCode and assetIssuer and reject missing or malformed issuers", () => {
  assert.equal(isNativeAsset({ asset_type: "native" }), true);
  assert.equal(isIssuedAsset({ asset_type: "native" }), false);
  assert.equal(
    formatAssetKey("USDC", fixture.payments[0].asset_issuer),
    `USDC:${fixture.payments[0].asset_issuer}`,
  );
  assert.throws(
    () => formatAssetKey("USDC"),
    (err) => err instanceof ProcessingError && err.code === "INVALID_PAYMENT",
  );
});
