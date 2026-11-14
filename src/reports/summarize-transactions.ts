import { ProcessingError } from "../errors.js";
import {
  fromUnits,
  normalizedTransactionSchema,
  toUnits,
  type NormalizedOnchainTransaction,
} from "../validation.js";
import type {
  CategoryLabelMap,
  OnchainReportSummary,
  ReadableFinanceCategory,
  ReportAssetSummary,
} from "./onchain-summary.types.js";

export const READABLE_FINANCE_LABELS: CategoryLabelMap = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  fee: "Fee",
  unknown: "Unknown",
};

export function toReadableCategory(
  type: NormalizedOnchainTransaction["type"],
): ReadableFinanceCategory {
  return READABLE_FINANCE_LABELS[type];
}

/**
 * Generates report-ready on-chain totals by type, readable finance category
 * (`Income`, `Expense`, `Transfer`, `Fee`, `Unknown`), asset, direction, and
 * network fee without leaking private backend-only context.
 */
export function summarizeTransactionsReport(
  inputs: readonly NormalizedOnchainTransaction[],
): OnchainReportSummary {
  const wallets = new Set(inputs.map((input) => input.walletAddress));
  if (wallets.size > 1) {
    throw new ProcessingError(
      "INVALID_REQUEST",
      "Summaries require a single wallet perspective.",
    );
  }

  const seen = new Map<string, string>();
  const assets = new Map<string, ReportAssetSummary>();
  const byCategoryCount: Record<ReadableFinanceCategory, number> = {
    Income: 0,
    Expense: 0,
    Transfer: 0,
    Fee: 0,
    Unknown: 0,
  };
  let feeRecordCount = 0;
  let totalNetworkFeeUnits = 0n;

  for (const input of inputs) {
    const parsed = normalizedTransactionSchema.safeParse(input);
    if (!parsed.success) {
      throw new ProcessingError(
        "INVALID_PAYMENT",
        "Normalized transaction is invalid.",
      );
    }
    const tx = parsed.data;
    const encoded = JSON.stringify(tx);
    if (seen.has(tx.id)) {
      if (seen.get(tx.id) !== encoded) {
        throw new ProcessingError(
          "CONFLICTING_RECORD",
          "Duplicate transaction identity has conflicting values.",
        );
      }
      continue;
    }
    seen.set(tx.id, encoded);

    const category = toReadableCategory(tx.type);
    byCategoryCount[category] += 1;

    const key = JSON.stringify([tx.assetCode, tx.assetIssuer ?? null]);
    let totals = assets.get(key);
    if (!totals) {
      totals = {
        assetCode: tx.assetCode,
        ...(tx.assetIssuer !== undefined ? { assetIssuer: tx.assetIssuer } : {}),
        byType: {
          income: "0",
          expense: "0",
          transfer: "0",
          fee: "0",
          unknown: "0",
        },
        byCategory: {
          Income: "0",
          Expense: "0",
          Transfer: "0",
          Fee: "0",
          Unknown: "0",
        },
        byDirection: {
          incoming: "0",
          outgoing: "0",
          internal: "0",
          unknown: "0",
        },
        feeTotal: "0",
      };
      assets.set(key, totals);
    }

    const amountUnits = toUnits(tx.amount);
    totals.byType[tx.type] = fromUnits(
      toUnits(totals.byType[tx.type]) + amountUnits,
    );
    totals.byCategory[category] = fromUnits(
      toUnits(totals.byCategory[category]) + amountUnits,
    );
    totals.byDirection[tx.direction] = fromUnits(
      toUnits(totals.byDirection[tx.direction]) + amountUnits,
    );

    if (tx.type === "fee") {
      feeRecordCount += 1;
      totals.feeTotal = fromUnits(toUnits(totals.feeTotal) + amountUnits);
      if (tx.assetCode === "XLM" && tx.assetIssuer === undefined) {
        totalNetworkFeeUnits += amountUnits;
      }
    }
  }

  const singleWallet = inputs[0]?.walletAddress;

  return {
    ...(singleWallet !== undefined ? { walletAddress: singleWallet } : {}),
    transactionCount: seen.size,
    feeRecordCount,
    totalNetworkFeeXlm: fromUnits(totalNetworkFeeUnits),
    byCategoryCount,
    assets: [...assets.values()].sort((a, b) =>
      JSON.stringify([a.assetCode, a.assetIssuer ?? ""]).localeCompare(
        JSON.stringify([b.assetCode, b.assetIssuer ?? ""]),
      ),
    ),
  };
}

export { summarizeTransactionsReport as summarizeTransactions };
export type {
  OnchainReportSummary,
  ReportAssetSummary,
  ReadableFinanceCategory,
  CategoryLabelMap,
} from "./onchain-summary.types.js";
