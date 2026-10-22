import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  fetchStellarActivity,
  HorizonError,
  processStellarPayments,
} from "../dist/index.js";
const fixture = JSON.parse(
  await readFile(new URL("./fixtures/payments.json", import.meta.url)),
);
const page = (records) =>
  new Response(JSON.stringify({ _embedded: { records } }), { status: 200 });

test("Horizon adapter uses fixed runtime, ascending cursor and transaction join across bounded pages", async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push(new URL(url));
    assert.equal(options.redirect, "error");
    const start = calls.length === 1 ? 0 : 2;
    return page(
      fixture.payments
        .slice(start, start + 2)
        .map((p) => ({ ...p, paging_token: p.id })),
    );
  };
  const result = await fetchStellarActivity(
    fixture.walletAddress,
    { network: "testnet", pageSize: 2, maxPages: 2 },
    request,
  );
  assert.equal(calls[0].origin, "https://horizon-testnet.stellar.org");
  assert.equal(calls[0].searchParams.get("join"), "transactions");
  assert.equal(calls[1].searchParams.get("cursor"), "102");
  assert.equal(result.cursor, "104");
  assert.equal(result.hasMore, true);
  assert.equal(
    processStellarPayments({
      walletAddress: fixture.walletAddress,
      payments: result.payments,
    }).transactions.length,
    6,
  );
});
test("unsupported operations are counted and cursor advances, empty history is successful", async () => {
  const response = await fetchStellarActivity(
    fixture.walletAddress,
    { network: "public" },
    async () =>
      page([{ id: "200", paging_token: "200", type: "create_account" }]),
  );
  assert.equal(response.unsupportedCount, 1);
  assert.equal(response.cursor, "200");
  assert.equal(response.hasMore, false);
  const empty = await fetchStellarActivity(
    fixture.walletAddress,
    { network: "testnet", cursor: "200" },
    async () => page([]),
  );
  assert.equal(empty.cursor, "200");
  assert.deepEqual(empty.payments, []);
});
test("timeouts, missing accounts, upstream errors and invalid pagination fail safely", async () => {
  for (const [request, code] of [
    [
      async () => {
        throw new Error("provider-secret");
      },
      "HORIZON_UNAVAILABLE",
    ],
    [async () => new Response("", { status: 404 }), "ACCOUNT_NOT_FOUND"],
    [async () => new Response("", { status: 429 }), "HORIZON_UNAVAILABLE"],
    [async () => new Response("{broken"), "INVALID_HORIZON_RESPONSE"],
    [
      async () => page([{ ...fixture.payments[0], paging_token: "0" }]),
      "INVALID_HORIZON_RESPONSE",
    ],
    [
      async () =>
        page([{ ...fixture.payments[0], amount: "NaN", paging_token: "101" }]),
      "INVALID_HORIZON_RESPONSE",
    ],
  ])
    await assert.rejects(
      () =>
        fetchStellarActivity(
          fixture.walletAddress,
          { network: "testnet" },
          request,
        ),
      (e) =>
        e instanceof HorizonError &&
        e.code === code &&
        !e.message.includes("provider-secret"),
    );
});
