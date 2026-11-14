import { ProcessingError } from "../errors.js";
import {
  normalizedTransactionSchema,
  requireAddress,
  type NormalizedOnchainTransaction,
} from "../validation.js";
import {
  evaluateClassificationRules,
  FINANCE_LABEL_BY_TYPE,
  type ClassificationRuleResult,
  type TransactionFinanceLabel,
} from "./classification-rules.js";

export type ClassifiedOnchainTransaction = NormalizedOnchainTransaction & {
  financeLabel: TransactionFinanceLabel;
  classificationReason: ClassificationRuleResult["reason"];
};

export type ClassifyTransactionOptions = {
  /** Optional list of additional public Stellar wallet addresses owned by the same user. */
  ownedWallets?: readonly string[];
};

/**
 * Classifies a normalized Stellar transaction into conservative on-chain finance
 * types (`income`, `expense`, `transfer`, `fee`, `unknown`) and readable labels
 * (`Income`, `Expense`, `Transfer`, `Fee`, `Unknown`).
 */
export function classifyTransactionWithDetails(
  input: unknown,
  options: ClassifyTransactionOptions = {},
): ClassifiedOnchainTransaction {
  const parsed = normalizedTransactionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProcessingError(
      "INVALID_PAYMENT",
      "Normalized transaction is invalid.",
    );
  }

  const ownedSet = new Set<string>();
  if (options.ownedWallets) {
    for (const addr of options.ownedWallets) {
      ownedSet.add(requireAddress(addr));
    }
  }

  const tx = parsed.data;
  const rule = evaluateClassificationRules(tx, ownedSet);

  return {
    ...tx,
    type: rule.type,
    financeLabel: rule.label,
    classificationReason: rule.reason,
  };
}

export function classifyTransaction(
  input: NormalizedOnchainTransaction,
  options: ClassifyTransactionOptions = {},
): NormalizedOnchainTransaction {
  const classified = classifyTransactionWithDetails(input, options);
  const {
    financeLabel: _label,
    classificationReason: _reason,
    ...normalized
  } = classified;
  return normalized;
}

export {
  FINANCE_LABEL_BY_TYPE,
  evaluateClassificationRules,
  type TransactionFinanceLabel,
  type ClassificationRuleResult,
};
