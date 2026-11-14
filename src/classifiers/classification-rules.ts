import type { NormalizedOnchainTransaction } from "../validation.js";

export type TransactionFinanceLabel =
  | "Income"
  | "Expense"
  | "Transfer"
  | "Fee"
  | "Unknown";

export type ClassificationRuleResult = {
  type: NormalizedOnchainTransaction["type"];
  label: TransactionFinanceLabel;
  reason:
    | "explicit_fee"
    | "self_transfer"
    | "owned_wallet_transfer"
    | "explicit_type_preserved"
    | "conservative_unknown";
};

export const FINANCE_LABEL_BY_TYPE: Record<
  NormalizedOnchainTransaction["type"],
  TransactionFinanceLabel
> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  fee: "Fee",
  unknown: "Unknown",
};

/**
 * Deterministic classification rules for normalized Stellar transactions:
 * 1. Explicit network fees (`type === "fee"` or `operationId === "fee"`) -> `fee` (`Fee`)
 * 2. Internal self-transfers (`direction === "internal"`) -> `transfer` (`Transfer`)
 * 3. Transfers between caller-supplied owned public wallet addresses -> `transfer` (`Transfer`)
 * 4. Pre-classified `income` / `expense` / `transfer` records preserve their type
 * 5. All other incoming/outgoing movements remain conservatively `unknown` (`Unknown`)
 */
export function evaluateClassificationRules(
  transaction: NormalizedOnchainTransaction,
  ownedWallets: ReadonlySet<string> = new Set(),
): ClassificationRuleResult {
  if (transaction.type === "fee" || transaction.operationId === "fee") {
    return {
      type: "fee",
      label: FINANCE_LABEL_BY_TYPE.fee,
      reason: "explicit_fee",
    };
  }

  if (transaction.direction === "internal") {
    return {
      type: "transfer",
      label: FINANCE_LABEL_BY_TYPE.transfer,
      reason: "self_transfer",
    };
  }

  if (
    transaction.counterparty !== undefined &&
    ownedWallets.has(transaction.counterparty)
  ) {
    return {
      type: "transfer",
      label: FINANCE_LABEL_BY_TYPE.transfer,
      reason: "owned_wallet_transfer",
    };
  }

  if (
    transaction.type === "income" ||
    transaction.type === "expense" ||
    transaction.type === "transfer"
  ) {
    return {
      type: transaction.type,
      label: FINANCE_LABEL_BY_TYPE[transaction.type],
      reason: "explicit_type_preserved",
    };
  }

  return {
    type: "unknown",
    label: FINANCE_LABEL_BY_TYPE.unknown,
    reason: "conservative_unknown",
  };
}
