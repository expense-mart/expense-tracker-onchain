import { ProcessingError } from "./errors.js";
import {
  parsePayment,
  requireAddress,
  type NormalizedOnchainTransaction,
} from "./validation.js";

/** Conservative: a public payment establishes movement, not economic intent. */
export function classifyTransaction(
  transaction: NormalizedOnchainTransaction,
): NormalizedOnchainTransaction {
  return {
    ...transaction,
    type:
      transaction.type === "fee"
        ? "fee"
        : transaction.direction === "internal"
          ? "transfer"
          : "unknown",
  };
}

export function normalizeStellarPayment(
  input: unknown,
  walletAddress: string,
): NormalizedOnchainTransaction {
  requireAddress(walletAddress);
  const payment = parsePayment(input);
  if (payment.from !== walletAddress && payment.to !== walletAddress) {
    throw new ProcessingError(
      "INVALID_PAYMENT",
      "Payment does not involve the selected wallet.",
    );
  }
  const direction =
    payment.from === walletAddress && payment.to === walletAddress
      ? "internal"
      : payment.to === walletAddress
        ? "incoming"
        : "outgoing";
  return classifyTransaction({
    id: `stellar:${payment.transaction_hash}:${payment.id}:${walletAddress}`,
    source: "onchain",
    network: "stellar",
    walletAddress,
    transactionHash: payment.transaction_hash,
    operationId: payment.id,
    direction,
    type: "unknown",
    assetCode: payment.asset_type === "native" ? "XLM" : payment.asset_code,
    ...(payment.asset_type !== "native"
      ? { assetIssuer: payment.asset_issuer }
      : {}),
    amount: payment.amount,
    counterparty: payment.from === walletAddress ? payment.to : payment.from,
    ...(payment.transaction?.memo !== undefined
      ? { memo: payment.transaction.memo }
      : {}),
    occurredAt: payment.created_at,
  });
}
