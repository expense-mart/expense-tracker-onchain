# Expense Tracker onchain

A reusable read-only TypeScript library for classic Stellar payments: public address validation, fixed-host Horizon fetching, parsing/normalization, conservative classification, issuer-preserving asset identity, transaction-level XLM fees, and exact decimal summaries. It has no dependency on backend users, databases, private notes or categories.

## Setup

Requires Node.js >=22.12 (verified on 22.21) and npm 10.

```sh
npm ci --ignore-scripts
npm run verify
npm run example
```

The lockfile pins dependencies. `verify` typechecks, builds JavaScript/declarations and runs deterministic Node tests. `example` processes the committed synthetic fixture without network access. Fixture G-addresses encode fixed public bytes; no private keys, seed phrases or real user records are included. They are not promised to exist on a live network.

The private `0.1.0` package is imported by the sibling backend using a local file dependency. Build before consuming it. There has been no public release or package publication.

## API

```ts
import { fetchStellarActivity, processStellarPayments } from '@expense-mart/onchain';
const activity = await fetchStellarActivity(publicAddress, {
  network: 'testnet', cursor: '0', pageSize: 100, maxPages: 5,
});
const result = processStellarPayments({ walletAddress: publicAddress, payments: activity.payments });
// activity: { payments, cursor, hasMore, unsupportedCount }
// result: { transactions, summary, warnings }
```

Other exports: `validateStellarAddress`, `normalizeStellarPayment`, `classifyTransaction`, `summarizeTransactions`, `fetchStellarPayments`, runtime raw/normalized schemas, inferred transaction types, `ProcessingError` and `HorizonError`. The convenience `fetchStellarPayments` returns an array, defaulting to testnet; if its bounded fetch has more history it fails rather than silently presenting a complete array. Cursor-aware integrations should use `fetchStellarActivity`.

### Live fetch contract

`fetchStellarActivity(address, options?, request?)` validates checksum G-addresses and reads only official `https://horizon-testnet.stellar.org` or `https://horizon.stellar.org`. Options select `testnet`/`public`, numeric cursor, page size 1–200 and max pages 1–10 (default 100 × 5). Each request has a 12-second timeout, requests ascending successful operations with joined transaction metadata, and never follows returned paging URLs or accepts arbitrary hosts. The injected `request` exists for deterministic adapter tests; production uses native fetch.

Pagination advances from numeric `paging_token` values and fails if a cursor does not advance. `cursor` is returned for the backend to commit atomically with records. `hasMore` means the request hit its page bound, not that all history is indexed. Unsupported non-payment operation types increment `unsupportedCount` and advance the cursor explicitly. The backend surfaces this coverage limitation to users.

`HorizonError` exposes only safe messages/codes: ACCOUNT_NOT_FOUND, HORIZON_UNAVAILABLE and INVALID_HORIZON_RESPONSE. Missing accounts on the selected network are not silently treated as empty history; an existing account with no matching records is an empty success. No built-in automatic retry is performed, so backend retry policy remains explicit.

### Processing contract

`processStellarPayments({ walletAddress, payments })` caps input at 1000 records and rejects unknown request-level fields. Native/issued classic `type: "payment"` records require operation `id`, `transaction_hash`, UTC `created_at`, `from`, `to`, decimal-string amount and asset fields. Issued assets require both code and issuer. Extra upstream fields are stripped. The live adapter supplies Horizon's joined `transaction`; caller-supplied processing can also provide this enrichment explicitly:

```json
{
  "transaction": {
    "hash": "64 lowercase hexadecimal characters",
    "successful": true,
    "fee_charged": "200",
    "fee_account": "G...",
    "memo": "optional public memo"
  }
}
```

Without trusted metadata, normalization warns that fees/memos may be incomplete instead of inventing them. For supplied records, the library validates shape and internal consistency, not ledger authenticity. Unsupported operations in direct processing, malformed data, unrelated wallet, hash mismatch, conflicting replay or inconsistent metadata fail the whole batch with safe `ProcessingError` codes.

Amounts have up to seven fractional places and classic signed-int64 unit bounds; arithmetic uses `bigint`, never floating point. Original payment strings are preserved, aggregates use canonical decimal strings. Asset code **and issuer** define identity; code alone does not establish a trusted stablecoin. No fiat conversion or unitless cross-asset sum is performed.

Incoming/outgoing describe movement and retain type `unknown`; source/destination do not prove economic intent. Self-payments are `internal`/`transfer`. Backend user corrections are private and never inputs to public fetching/processing. A supplied normalized set can be summarized after backend annotations are stripped.

Enriched fee metadata emits one separate XLM `fee` record per transaction only for the selected fee payer, including fee-bump payer attribution from `fee_account`. Its synthetic operation ID is `fee`. Payments do not repeat the fee. Metadata from any operation enriches all included operations of that hash independently of order. Identical operation replay is deduplicated; conflicting values fail. No raw payload is returned.

`summary.assets` groups by code and issuer and contains exact `byType`/`byDirection` subtotals. `transactionCount` counts normalized records including explicit fees, not unique chain hashes. A summary is restricted to one wallet perspective. The backend namespaces storage by wallet/runtime and preserves private annotations across sync; this package does not implement database deduplication.

## Verification and current boundaries

Tests cover checksums, empty history, large exact amounts, issuer separation, self-transfers, fees/payer attribution, replay/conflicts, safe validation, missing enrichment, fixed provider URLs, pagination bounds/advancement and upstream error mapping. The frontend E2E tests exercise this package through the actual backend HTTP API with a deterministic upstream loader. A separate read-only live smoke on 22 October 2026 fetched five public mainnet payments and normalized nine records with no metadata warnings; it is not a comprehensive historical correctness test.

Classic successful payments are supported; path payments, account creation/merge, contract events, muxed-address tracking, failed transactions, fee-only history, trusted stablecoin rules and economic classification require follow-up. A fetch can request up to 2000 records; callers processing a batch must keep their selected bounds within the 1000-record processing limit or explicitly batch with cross-batch accounting. The backend uses at most 500 upstream operations per job and upserts fee identities across jobs.

Related issue groups: OC-001 validation, OC-002 client, OC-003 fetching, OC-004 parser, OC-005 normalization/schema, OC-006/007 classification, OC-008 asset identity, OC-009 fees and OC-010 summaries. Fixtures/tests/docs remain distributed across task positions 04/05/08/09/10. These are partial implementations of existing issue scopes, not declarations that every acceptance criterion is complete. No issue has been changed or closed.

Technical references: [Stellar account payments](https://developers.stellar.org/docs/data/apis/horizon/api-reference/get-payments-by-account-id), [pagination and transaction joins](https://developers.stellar.org/docs/data/apis/horizon/api-reference/list-all-payments), [SDK base exports](https://github.com/stellar/js-stellar-sdk), [StrKey validation](https://stellar.github.io/js-stellar-base/StrKey.html).

Implementation evidence and issue mapping: [cross-repository report](https://github.com/expense-mart/expense-tracker-backend/blob/main/docs/IMPLEMENTATION_REPORT.md).
