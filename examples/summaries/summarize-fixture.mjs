import { readFile } from "node:fs/promises";
import { processStellarPayments } from "../../dist/index.js";
import { summarizeTransactionsReport } from "../../dist/reports/summarize-transactions.js";

const fixture = JSON.parse(
  await readFile(new URL("../../test/fixtures/payments.json", import.meta.url)),
);
const { transactions } = processStellarPayments(fixture);
const summaryReport = summarizeTransactionsReport(transactions);
console.log(JSON.stringify(summaryReport, null, 2));
