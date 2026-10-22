import { z } from "zod";
import { ProcessingError } from "./errors.js";
import { normalizeStellarPayment } from "./normalizer.js";
import { summarizeTransactions } from "./summary.js";
import {
  parsePayment,
  requireAddress,
  fromUnits,
  normalizedTransactionSchema,
  type NormalizedOnchainTransaction,
} from "./validation.js";

// Unknown keys reject private context instead of forwarding it into chain processing.
const requestSchema = z
  .object({
    walletAddress: z.string(),
    payments: z.array(z.unknown()).max(1000),
  })
  .strict();

export function processStellarPayments(input: unknown) {
  const result = requestSchema.safeParse(input);
  if (!result.success)
    throw new ProcessingError(
      "INVALID_REQUEST",
      "Provide walletAddress and up to 1000 payments.",
    );
  const walletAddress = requireAddress(result.data.walletAddress);
  const operations = new Map<string, string>();
  const metadata = new Map<
    string,
    {
      encoded: string;
      transaction: NonNullable<ReturnType<typeof parsePayment>["transaction"]>;
      occurredAt: string;
    }
  >();
  const transactions: NormalizedOnchainTransaction[] = [];
  const missing = new Set<string>();
  for (const inputPayment of result.data.payments) {
    const payment = parsePayment(inputPayment);
    const normalized = normalizeStellarPayment(payment, walletAddress);
    const operationKey = `${payment.transaction_hash}:${payment.id}`;
    const encoded = JSON.stringify({ ...normalized, memo: undefined });
    if (
      operations.has(operationKey) &&
      operations.get(operationKey) !== encoded
    ) {
      throw new ProcessingError(
        "CONFLICTING_RECORD",
        "Duplicate operation identity has conflicting values.",
      );
    }
    if (!operations.has(operationKey)) {
      operations.set(operationKey, encoded);
      transactions.push(normalized);
    }
    if (payment.transaction) {
      const existing = metadata.get(payment.transaction_hash);
      const encodedMetadata = JSON.stringify(payment.transaction);
      if (
        existing &&
        (existing.encoded !== encodedMetadata ||
          existing.occurredAt !== payment.created_at)
      ) {
        throw new ProcessingError(
          "CONFLICTING_RECORD",
          "Transaction metadata is inconsistent across operations.",
        );
      }
      metadata.set(payment.transaction_hash, {
        encoded: encodedMetadata,
        transaction: payment.transaction,
        occurredAt: payment.created_at,
      });
    } else missing.add(payment.transaction_hash);
  }
  // Enrichment applies to every operation of a transaction, regardless of input ordering.
  for (const tx of transactions) {
    const memo = metadata.get(tx.transactionHash)?.transaction.memo;
    if (memo !== undefined) tx.memo = memo;
  }
  for (const [hash, entry] of metadata) {
    missing.delete(hash);
    if (
      entry.transaction.fee_account !== walletAddress ||
      BigInt(entry.transaction.fee_charged) === 0n
    )
      continue;
    transactions.push({
      id: `stellar:${hash}:fee:${walletAddress}`,
      operationId: "fee",
      transactionHash: hash,
      source: "onchain",
      network: "stellar",
      walletAddress,
      direction: "outgoing",
      type: "fee",
      assetCode: "XLM",
      amount: fromUnits(BigInt(entry.transaction.fee_charged)),
      occurredAt: entry.occurredAt,
    });
  }
  transactions.sort(
    (a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
  );
  for (const tx of transactions) {
    if (!normalizedTransactionSchema.safeParse(tx).success) {
      throw new ProcessingError(
        "INVALID_PAYMENT",
        "Processing produced an invalid transaction.",
      );
    }
  }
  return {
    transactions,
    summary: summarizeTransactions(transactions),
    warnings: missing.size
      ? [
          {
            code: "MISSING_TRANSACTION_METADATA",
            message:
              "Fees and memos may be incomplete for payments without transaction metadata.",
          },
        ]
      : [],
  };
}
