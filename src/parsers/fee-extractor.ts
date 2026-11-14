import { ProcessingError } from "../errors.js";
import {
  fromUnits,
  parsePayment,
  requireAddress,
  toUnits,
  type NormalizedOnchainTransaction,
} from "../validation.js";

export type ExtractedFeeRecord = NormalizedOnchainTransaction & {
  type: "fee";
  direction: "outgoing";
  assetCode: "XLM";
  categoryLabel: "Fee";
  feeStroops: string;
};

export type FeeExtractionResult = {
  walletAddress: string;
  feeRecords: ExtractedFeeRecord[];
  totalFeeXlm: string;
  totalFeeStroops: string;
  missingMetadataTransactionHashes: string[];
};

/**
 * Extracts transaction-level Stellar network fees (`XLM`) for a given wallet
 * without confusing fee records with payment amounts.
 *
 * - Emits at most one fee record per unique `transaction_hash`.
 * - Attributes the fee only when `transaction.fee_account === walletAddress`
 *   and `BigInt(transaction.fee_charged) > 0n` (supports fee-bump attribution).
 * - Rejects inconsistent fee metadata across operations sharing the same hash.
 */
export function extractNetworkFees(
  paymentsInput: readonly unknown[],
  walletAddressInput: unknown,
): FeeExtractionResult {
  const walletAddress = requireAddress(walletAddressInput);
  if (!Array.isArray(paymentsInput) || paymentsInput.length > 1000) {
    throw new ProcessingError(
      "INVALID_REQUEST",
      "Provide walletAddress and up to 1000 payments.",
    );
  }

  const metadataByHash = new Map<
    string,
    {
      encoded: string;
      feeCharged: string;
      feeAccount: string;
      occurredAt: string;
    }
  >();
  const missingHashes = new Set<string>();

  for (const rawInput of paymentsInput) {
    const payment = parsePayment(rawInput);
    if (payment.from !== walletAddress && payment.to !== walletAddress) {
      throw new ProcessingError(
        "INVALID_PAYMENT",
        "Payment does not involve the selected wallet.",
      );
    }

    if (payment.transaction) {
      const encoded = JSON.stringify(payment.transaction);
      const existing = metadataByHash.get(payment.transaction_hash);
      if (
        existing &&
        (existing.encoded !== encoded ||
          existing.occurredAt !== payment.created_at)
      ) {
        throw new ProcessingError(
          "CONFLICTING_RECORD",
          "Transaction metadata is inconsistent across operations.",
        );
      }
      metadataByHash.set(payment.transaction_hash, {
        encoded,
        feeCharged: payment.transaction.fee_charged,
        feeAccount: payment.transaction.fee_account,
        occurredAt: payment.created_at,
      });
    } else {
      missingHashes.add(payment.transaction_hash);
    }
  }

  const feeRecords: ExtractedFeeRecord[] = [];
  let totalStroops = 0n;

  for (const [hash, entry] of metadataByHash) {
    missingHashes.delete(hash);
    const stroops = BigInt(entry.feeCharged);
    if (entry.feeAccount !== walletAddress || stroops === 0n) {
      continue;
    }

    const amountXlm = fromUnits(stroops);
    totalStroops += stroops;

    feeRecords.push({
      id: `stellar:${hash}:fee:${walletAddress}`,
      operationId: "fee",
      transactionHash: hash,
      source: "onchain",
      network: "stellar",
      walletAddress,
      direction: "outgoing",
      type: "fee",
      categoryLabel: "Fee",
      assetCode: "XLM",
      amount: amountXlm,
      feeStroops: entry.feeCharged,
      occurredAt: entry.occurredAt,
    });
  }

  feeRecords.sort(
    (a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
  );

  // Sanity check that totalFeeXlm matches sum of feeRecord amounts
  const sumCheck = feeRecords.reduce(
    (acc, rec) => acc + toUnits(rec.amount),
    0n,
  );
  if (sumCheck !== totalStroops) {
    throw new ProcessingError(
      "INVALID_PAYMENT",
      "Fee unit conversion mismatch.",
    );
  }

  return {
    walletAddress,
    feeRecords,
    totalFeeXlm: fromUnits(totalStroops),
    totalFeeStroops: totalStroops.toString(),
    missingMetadataTransactionHashes: [...missingHashes].sort(),
  };
}
