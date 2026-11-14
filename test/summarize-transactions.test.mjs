import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { processStellarPayments, ProcessingError } from "../dist/index.js";
import {
  summarizeTransactionsReport,
  toReadableCategory,
  READABLE_FINANCE_LABELS,
} from "../dist/reports/summarize-transactions.js";

const fixture = JSON.parse(
  await readFile(new URL("./fixtures/payments.json", import.meta.url)),
);

test("OC-010: readable finance labels map internal types to Income, Expense, Transfer, Fee, Unknown", () => {
  assert.deepEqual(READABLE_FINANCE_LABELS, {
    income: "Income",
    expense: "Expense",
    transfer: "Transfer",
    fee: "Fee",
    unknown: "Unknown",
  });
  assert.equal(toReadableCategory("income"), "Income");
  assert.equal(toReadableCategory("expense"), "Expense");
  assert.equal(toReadableCategory("transfer"), "Transfer");
  assert.equal(toReadableCategory("fee"), "Fee");
  assert.equal(toReadableCategory("unknown"), "Unknown");
});

test("OC-010: summarizeTransactionsReport computes per-asset byType, byCategory, byDirection, and fee totals", () => {
  const processed = processStellarPayments(fixture);
  const report = summarizeTransactionsReport(processed.transactions);

  assert.equal(report.walletAddress, fixture.walletAddress);
  assert.equal(report.transactionCount, 6);
  assert.equal(report.feeRecordCount, 2);
  assert.equal(report.totalNetworkFeeXlm, "0.00003");
  assert.deepEqual(report.byCategoryCount, {
    Income: 0,
    Expense: 0,
    Transfer: 1,
    Fee: 2,
    Unknown: 3,
  });

  const xlm = report.assets.find((a) => a.assetCode === "XLM");
  assert.ok(xlm);
  assert.equal(xlm.byCategory.Fee, "0.00003");
  assert.equal(xlm.byCategory.Unknown, "0.0000001");
  assert.equal(xlm.feeTotal, "0.00003");
  assert.equal(xlm.byDirection.outgoing, "0.0000301");

  const usdc = report.assets.find(
    (a) => a.assetIssuer === fixture.payments[0].asset_issuer,
  );
  assert.ok(usdc);
  assert.equal(usdc.byCategory.Unknown, "900719935.9740993");
  assert.equal(usdc.byCategory.Income, "0");
  assert.equal(usdc.byCategory.Expense, "0");

  const selfTransferUsdc = report.assets.find(
    (a) => a.assetIssuer === fixture.payments[3].asset_issuer,
  );
  assert.ok(selfTransferUsdc);
  assert.equal(selfTransferUsdc.byCategory.Transfer, "2");
  assert.equal(selfTransferUsdc.byDirection.internal, "2");
});

test("OC-010: summarizeTransactionsReport deduplicates identical records and rejects multi-wallet or conflicting inputs", () => {
  const processed = processStellarPayments(fixture);
  const duplicated = [
    ...processed.transactions,
    ...processed.transactions,
  ];
  assert.deepEqual(
    summarizeTransactionsReport(duplicated),
    summarizeTransactionsReport(processed.transactions),
  );

  const conflicting = { ...processed.transactions[0], amount: "99.5" };
  assert.throws(
    () => summarizeTransactionsReport([...processed.transactions, conflicting]),
    (err) => err instanceof ProcessingError && err.code === "CONFLICTING_RECORD",
  );

  const otherWallet = {
    ...processed.transactions[0],
    id: "other-wallet-tx",
    walletAddress: fixture.payments[0].to,
  };
  assert.throws(
    () => summarizeTransactionsReport([...processed.transactions, otherWallet]),
    (err) => err instanceof ProcessingError && err.code === "INVALID_REQUEST",
  );
});
