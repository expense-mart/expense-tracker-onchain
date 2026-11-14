import { readFile } from "node:fs/promises";
import { extractNetworkFees } from "../../dist/parsers/fee-extractor.js";

const fixture = JSON.parse(
  await readFile(new URL("../../test/fixtures/payments.json", import.meta.url)),
);
console.log(
  JSON.stringify(
    extractNetworkFees(fixture.payments, fixture.walletAddress),
    null,
    2,
  ),
);
