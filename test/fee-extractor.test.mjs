import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ProcessingError } from "../dist/index.js";
import { extractNetworkFees } from "../dist/parsers/fee-extractor.js";

const fixture = JSON.parse(
  await readFile(new URL("./fixtures/payments.json", import.meta.url)),
);

test("OC-009: extractNetworkFees extracts one XLM fee record per transaction paid by walletAddress", () => {
  const result = extractNetworkFees(fixture.payments, fixture.walletAddress);

  assert.equal(result.walletAddress, fixture.walletAddress);
  assert.equal(result.feeRecords.length, 2);
  assert.equal(result.totalFeeStroops, "300");
  assert.equal(result.totalFeeXlm, "0.00003");
  assert.deepEqual(result.missingMetadataTransactionHashes, []);

  for (const fee of result.feeRecords) {
    assert.equal(fee.type, "fee");
    assert.equal(fee.categoryLabel, "Fee");
    assert.equal(fee.direction, "outgoing");
    assert.equal(fee.assetCode, "XLM");
    assert.equal("assetIssuer" in fee, false);
  }

  assert.equal(result.feeRecords[0].amount, "0.00002");
  assert.equal(result.feeRecords[0].feeStroops, "200");
  assert.equal(result.feeRecords[1].amount, "0.00001");
  assert.equal(result.feeRecords[1].feeStroops, "100");
});

test("OC-009: extractNetworkFees tracks missing transaction metadata and rejects conflicting fee records", () => {
  const withoutMeta = structuredClone(fixture.payments);
  for (const p of withoutMeta) {
    delete p.transaction;
  }
  const missingResult = extractNetworkFees(withoutMeta, fixture.walletAddress);
  assert.equal(missingResult.feeRecords.length, 0);
  assert.equal(missingResult.totalFeeXlm, "0");
  assert.equal(missingResult.missingMetadataTransactionHashes.length, 3);

  const conflicting = structuredClone(fixture.payments);
  conflicting[1].transaction.fee_charged = "900";
  assert.throws(
    () => extractNetworkFees(conflicting, fixture.walletAddress),
    (err) => err instanceof ProcessingError && err.code === "CONFLICTING_RECORD",
  );
});
