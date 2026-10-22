import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  processStellarPayments,
  normalizeStellarPayment,
  validateStellarAddress,
  normalizedTransactionSchema,
  summarizeTransactions,
  ProcessingError,
} from "../dist/index.js";
const fixture = JSON.parse(
  await readFile(new URL("./fixtures/payments.json", import.meta.url)),
);
const clone = () => structuredClone(fixture);
const code = (expected) => (error) =>
  error instanceof ProcessingError && error.code === expected;

test("validates public address checksums without echoing invalid/private input", () => {
  assert.equal(validateStellarAddress(fixture.walletAddress).success, true);
  for (const value of [
    null,
    "",
    "S".repeat(56),
    "G".repeat(56),
    `${fixture.walletAddress} `,
    fixture.walletAddress.slice(0, -1) + "A",
  ]) {
    const result = validateStellarAddress(value);
    assert.equal(result.success, false);
    assert.deepEqual(Object.keys(result.error), ["code", "message"]);
  }
});

test("fixture -> normalized records -> exact per-issuer totals and one XLM fee per transaction", () => {
  const before = JSON.stringify(fixture);
  const output = processStellarPayments(fixture);
  assert.equal(JSON.stringify(fixture), before, "never mutate caller data");
  assert.equal(output.transactions.length, 6);
  assert.equal(output.summary.transactionCount, 6);
  for (const tx of output.transactions)
    assert.equal(normalizedTransactionSchema.safeParse(tx).success, true);
  const xlm = output.summary.assets.find((a) => a.assetCode === "XLM");
  assert.equal(xlm.byType.fee, "0.00003");
  assert.equal(xlm.byType.unknown, "0.0000001");
  assert.equal(xlm.byDirection.outgoing, "0.0000301");
  const usdc = output.summary.assets.find(
    (a) => a.assetIssuer === fixture.payments[0].asset_issuer,
  );
  assert.equal(usdc.byType.unknown, "900719935.9740993");
  assert.equal(usdc.byType.income, "0", "movement does not prove income");
  assert.equal(usdc.byDirection.incoming, "900719925.4740993");
  const internal = output.summary.assets.find(
    (a) => a.assetIssuer === fixture.payments[3].asset_issuer,
  );
  assert.equal(internal.byType.transfer, "2");
  assert.equal(internal.byDirection.internal, "2");
  assert.equal(
    output.summary.assets.length,
    3,
    "do not merge identically named assets from different issuers",
  );
  assert.deepEqual(output.warnings, []);
  assert.equal(output.transactions.filter((t) => t.type === "fee").length, 2);
  assert.equal(
    output.transactions.filter((t) => t.operationId === "101")[0].memo,
    "Synthetic test payment",
  );
  assert.equal(
    output.transactions.some((t) => "raw" in t || "transaction" in t),
    false,
  );
});

test("empty activity returns an empty summary", () => {
  assert.deepEqual(
    processStellarPayments({
      walletAddress: fixture.walletAddress,
      payments: [],
    }),
    {
      transactions: [],
      summary: { transactionCount: 0, assets: [] },
      warnings: [],
    },
  );
});

test("identical operation replay is deduplicated; conflicting replay fails", () => {
  const input = clone();
  input.payments.push(structuredClone(input.payments[0]));
  assert.deepEqual(
    processStellarPayments(input),
    processStellarPayments(fixture),
  );
  input.payments.at(-1).amount = "11";
  assert.throws(
    () => processStellarPayments(input),
    code("CONFLICTING_RECORD"),
  );
});

test("one transaction cannot have inconsistent fee, memo or timestamp metadata", () => {
  for (const mutate of [
    (p) => (p.transaction.fee_charged = "300"),
    (p) => (p.transaction.memo = "different"),
    (p) => (p.created_at = "2026-07-06T12:00:00Z"),
  ]) {
    const input = clone();
    mutate(input.payments[1]);
    assert.throws(
      () => processStellarPayments(input),
      code("CONFLICTING_RECORD"),
    );
  }
});

test("metadata enrichment is order-independent and absent metadata warns instead of inventing fees", () => {
  const input = clone();
  delete input.payments[0].transaction;
  assert.deepEqual(
    processStellarPayments(input),
    processStellarPayments(fixture),
  );
  assert.deepEqual(
    processStellarPayments({
      ...input,
      payments: [...input.payments].reverse(),
    }),
    processStellarPayments(fixture),
  );
  input.payments.forEach((p) => delete p.transaction);
  const output = processStellarPayments(input);
  assert.equal(output.transactions.length, 4);
  assert.equal(
    output.transactions.some((t) => t.type === "fee"),
    false,
  );
  assert.equal(output.warnings[0].code, "MISSING_TRANSACTION_METADATA");
});

test("rejects malformed amounts, fees, hashes, issuers and missing fields as safe typed errors", () => {
  const changes = [
    (p) => (p.amount = "NaN"),
    (p) => (p.amount = "-1"),
    (p) => (p.amount = "1e3"),
    (p) => (p.amount = "0"),
    (p) => (p.amount = "1.00000001"),
    (p) => (p.amount = "922337203685.4775808"),
    (p) => (p.amount = 3),
    (p) => (p.transaction.fee_charged = "NaN"),
    (p) => (p.transaction.fee_charged = "-1"),
    (p) => (p.transaction_hash = "not-a-hash"),
    (p) => (p.transaction.hash = "d".repeat(64)),
    (p) => (p.asset_issuer = "invalid"),
    (p) => delete p.from,
    (p) => (p.created_at = "yesterday"),
    (p) => (p.transaction.successful = false),
    (p) => (p.asset_code = "USDC-too-long"),
  ];
  for (const mutate of changes) {
    const input = clone();
    mutate(input.payments[0]);
    assert.throws(() => processStellarPayments(input), code("INVALID_PAYMENT"));
  }
});

test("rejects unsupported operations, unrelated wallets, private context and oversized input", () => {
  const input = clone();
  input.payments[0].type = "path_payment_strict_send";
  assert.throws(
    () => processStellarPayments(input),
    code("UNSUPPORTED_OPERATION"),
  );
  assert.throws(
    () =>
      normalizeStellarPayment(
        fixture.payments[0],
        fixture.payments[0].asset_issuer,
      ),
    code("INVALID_PAYMENT"),
  );
  assert.throws(
    () => processStellarPayments({ ...fixture, note: "private" }),
    code("INVALID_REQUEST"),
  );
  assert.throws(
    () =>
      processStellarPayments({
        ...fixture,
        payments: Array(1001).fill(fixture.payments[0]),
      }),
    code("INVALID_REQUEST"),
  );
  assert.throws(
    () => processStellarPayments({ ...fixture, walletAddress: "invalid" }),
    code("INVALID_WALLET_ADDRESS"),
  );
});

test("summary prevents multi-wallet totals and conflicting identities; replay does not inflate totals", () => {
  const output = processStellarPayments(fixture);
  assert.deepEqual(
    summarizeTransactions([...output.transactions, ...output.transactions]),
    output.summary,
  );
  const changed = { ...output.transactions[0], amount: "20" };
  assert.throws(
    () => summarizeTransactions([...output.transactions, changed]),
    code("CONFLICTING_RECORD"),
  );
  const other = {
    ...changed,
    id: "different",
    walletAddress: fixture.payments[0].to,
  };
  assert.throws(
    () => summarizeTransactions([...output.transactions, other]),
    code("INVALID_REQUEST"),
  );
});

test("ignores extra upstream fields and does not leak them in normalized output", () => {
  const input = clone();
  input.payments[0].raw_secret = "do-not-echo";
  const output = processStellarPayments(input);
  assert.equal(JSON.stringify(output).includes("do-not-echo"), false);
});
