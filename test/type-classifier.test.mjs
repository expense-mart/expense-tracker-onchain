import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { processStellarPayments, ProcessingError } from "../dist/index.js";
import {
  classifyTransaction,
  classifyTransactionWithDetails,
  FINANCE_LABEL_BY_TYPE,
} from "../dist/classifiers/type.classifier.js";

const fixture = JSON.parse(
  await readFile(new URL("./fixtures/payments.json", import.meta.url)),
);

test("OC-007: classifyTransactionWithDetails maps fee, internal transfer, and uncertain external movements to readable labels", () => {
  assert.deepEqual(FINANCE_LABEL_BY_TYPE, {
    income: "Income",
    expense: "Expense",
    transfer: "Transfer",
    fee: "Fee",
    unknown: "Unknown",
  });

  const { transactions } = processStellarPayments(fixture);

  const feeTx = transactions.find((t) => t.type === "fee");
  assert.ok(feeTx);
  const classifiedFee = classifyTransactionWithDetails(feeTx);
  assert.equal(classifiedFee.type, "fee");
  assert.equal(classifiedFee.financeLabel, "Fee");
  assert.equal(classifiedFee.classificationReason, "explicit_fee");

  const selfTransferTx = transactions.find((t) => t.direction === "internal");
  assert.ok(selfTransferTx);
  const classifiedTransfer = classifyTransactionWithDetails(selfTransferTx);
  assert.equal(classifiedTransfer.type, "transfer");
  assert.equal(classifiedTransfer.financeLabel, "Transfer");
  assert.equal(classifiedTransfer.classificationReason, "self_transfer");

  const outgoingTx = transactions.find(
    (t) => t.direction === "outgoing" && t.type !== "fee",
  );
  assert.ok(outgoingTx);
  const classifiedUnknown = classifyTransactionWithDetails(outgoingTx);
  assert.equal(classifiedUnknown.type, "unknown");
  assert.equal(classifiedUnknown.financeLabel, "Unknown");
  assert.equal(classifiedUnknown.classificationReason, "conservative_unknown");

  // When counterparty is a known user-owned wallet, classify as Transfer
  const classifiedOwnedTransfer = classifyTransactionWithDetails(outgoingTx, {
    ownedWallets: [outgoingTx.counterparty],
  });
  assert.equal(classifiedOwnedTransfer.type, "transfer");
  assert.equal(classifiedOwnedTransfer.financeLabel, "Transfer");
  assert.equal(
    classifiedOwnedTransfer.classificationReason,
    "owned_wallet_transfer",
  );
});

test("OC-007: classifyTransaction preserves explicit income/expense types and rejects malformed inputs", () => {
  const { transactions } = processStellarPayments(fixture);
  const sample = transactions[0];

  const incomeTx = classifyTransactionWithDetails({
    ...sample,
    type: "income",
  });
  assert.equal(incomeTx.type, "income");
  assert.equal(incomeTx.financeLabel, "Income");

  const expenseTx = classifyTransactionWithDetails({
    ...sample,
    type: "expense",
  });
  assert.equal(expenseTx.type, "expense");
  assert.equal(expenseTx.financeLabel, "Expense");

  const stripped = classifyTransaction({ ...sample, type: "income" });
  assert.equal(stripped.type, "income");
  assert.equal("financeLabel" in stripped, false);

  assert.throws(
    () => classifyTransactionWithDetails({ ...sample, amount: "-5" }),
    (err) => err instanceof ProcessingError && err.code === "INVALID_PAYMENT",
  );
});
