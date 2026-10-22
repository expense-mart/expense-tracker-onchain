import { readFile } from "node:fs/promises";
import { processStellarPayments } from "../dist/index.js";
const fixture = JSON.parse(
  await readFile(new URL("../test/fixtures/payments.json", import.meta.url)),
);
console.log(JSON.stringify(processStellarPayments(fixture), null, 2));
