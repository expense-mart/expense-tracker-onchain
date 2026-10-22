import {
  normalizedTransactionSchema,
  toUnits,
  fromUnits,
  type NormalizedOnchainTransaction,
} from "./validation.js";
import { ProcessingError } from "./errors.js";

export type AssetSummary = {
  assetCode: string;
  assetIssuer?: string;
  byType: Record<NormalizedOnchainTransaction["type"], string>;
  byDirection: Record<NormalizedOnchainTransaction["direction"], string>;
};
export type OnchainSummary = {
  transactionCount: number;
  assets: AssetSummary[];
};

/** Totals are per wallet only; combining wallet perspectives would double-count transfers. */
export function summarizeTransactions(
  inputs: readonly NormalizedOnchainTransaction[],
): OnchainSummary {
  const wallets = new Set(inputs.map((input) => input.walletAddress));
  if (wallets.size > 1)
    throw new ProcessingError(
      "INVALID_REQUEST",
      "Summaries require a single wallet perspective.",
    );
  const seen = new Map<string, string>();
  const assets = new Map<string, AssetSummary>();
  for (const input of inputs) {
    const parsed = normalizedTransactionSchema.safeParse(input);
    if (!parsed.success)
      throw new ProcessingError(
        "INVALID_PAYMENT",
        "Normalized transaction is invalid.",
      );
    const tx = parsed.data;
    const encoded = JSON.stringify(tx);
    if (seen.has(tx.id)) {
      if (seen.get(tx.id) !== encoded)
        throw new ProcessingError(
          "CONFLICTING_RECORD",
          "Duplicate transaction identity has conflicting values.",
        );
      continue;
    }
    seen.set(tx.id, encoded);
    const key = JSON.stringify([tx.assetCode, tx.assetIssuer ?? null]);
    let totals = assets.get(key);
    if (!totals) {
      totals = {
        assetCode: tx.assetCode,
        ...(tx.assetIssuer ? { assetIssuer: tx.assetIssuer } : {}),
        byType: {
          income: "0",
          expense: "0",
          transfer: "0",
          fee: "0",
          unknown: "0",
        },
        byDirection: {
          incoming: "0",
          outgoing: "0",
          internal: "0",
          unknown: "0",
        },
      };
      assets.set(key, totals);
    }
    totals.byType[tx.type] = fromUnits(
      toUnits(totals.byType[tx.type]) + toUnits(tx.amount),
    );
    totals.byDirection[tx.direction] = fromUnits(
      toUnits(totals.byDirection[tx.direction]) + toUnits(tx.amount),
    );
  }
  return {
    transactionCount: seen.size,
    assets: [...assets.values()].sort((a, b) =>
      JSON.stringify([a.assetCode, a.assetIssuer ?? ""]).localeCompare(
        JSON.stringify([b.assetCode, b.assetIssuer ?? ""]),
      ),
    ),
  };
}
