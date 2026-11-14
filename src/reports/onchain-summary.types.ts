import type { NormalizedOnchainTransaction } from "../validation.js";

export type ReadableFinanceCategory =
  | "Income"
  | "Expense"
  | "Transfer"
  | "Fee"
  | "Unknown";

export type CategoryLabelMap = Record<
  NormalizedOnchainTransaction["type"],
  ReadableFinanceCategory
>;

export type ReportAssetSummary = {
  assetCode: string;
  assetIssuer?: string;
  byType: Record<NormalizedOnchainTransaction["type"], string>;
  byCategory: Record<ReadableFinanceCategory, string>;
  byDirection: Record<NormalizedOnchainTransaction["direction"], string>;
  feeTotal: string;
};

export type OnchainReportSummary = {
  walletAddress?: string;
  transactionCount: number;
  feeRecordCount: number;
  totalNetworkFeeXlm: string;
  byCategoryCount: Record<ReadableFinanceCategory, number>;
  assets: ReportAssetSummary[];
};
