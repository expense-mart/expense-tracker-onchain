import { z } from "zod";
import { ProcessingError } from "./errors.js";
import { parsePayment, requireAddress, type RawPayment } from "./validation.js";

export type StellarRuntime = "testnet" | "public";
export type FetchOptions = {
  network: StellarRuntime;
  cursor?: string;
  pageSize?: number;
  maxPages?: number;
};
export type FetchedActivity = {
  payments: RawPayment[];
  cursor: string;
  hasMore: boolean;
  unsupportedCount: number;
};
export class HorizonError extends Error {
  constructor(
    readonly code:
      "HORIZON_UNAVAILABLE" | "ACCOUNT_NOT_FOUND" | "INVALID_HORIZON_RESPONSE",
    message: string,
  ) {
    super(message);
  }
}
const endpoints = {
  testnet: "https://horizon-testnet.stellar.org",
  public: "https://horizon.stellar.org",
};
const pageSchema = z.object({
  _embedded: z.object({
    records: z.array(
      z
        .object({
          id: z.string(),
          paging_token: z.string().regex(/^\d+$/),
          type: z.string(),
        })
        .passthrough(),
    ),
  }),
});

/** Ascending bounded history; never follow a server-supplied URL or accept a caller-supplied host. */
export async function fetchStellarActivity(
  address: string,
  options: FetchOptions = { network: "testnet" },
  request: typeof fetch = fetch,
): Promise<FetchedActivity> {
  requireAddress(address);
  const pageSize = options.pageSize ?? 100;
  const maxPages = options.maxPages ?? 5;
  if (
    !(options.network in endpoints) ||
    !["testnet", "public"].includes(options.network) ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 200 ||
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 10 ||
    (options.cursor !== undefined && !/^\d+$/.test(options.cursor))
  ) {
    throw new ProcessingError(
      "INVALID_REQUEST",
      "Invalid Stellar fetch options.",
    );
  }
  const payments: RawPayment[] = [];
  let cursor = options.cursor ?? "0";
  let unsupportedCount = 0;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(
      `/accounts/${address}/payments`,
      endpoints[options.network],
    );
    url.search = new URLSearchParams({
      cursor,
      order: "asc",
      limit: String(pageSize),
      include_failed: "false",
      join: "transactions",
    }).toString();
    let response: Response;
    try {
      response = await request(url, {
        signal: AbortSignal.timeout(12000),
        headers: { accept: "application/json" },
        redirect: "error",
      });
    } catch {
      throw new HorizonError(
        "HORIZON_UNAVAILABLE",
        "Stellar history is temporarily unavailable. Please retry.",
      );
    }
    if (response.status === 404)
      throw new HorizonError(
        "ACCOUNT_NOT_FOUND",
        "This account does not exist on the selected Stellar network.",
      );
    if (!response.ok)
      throw new HorizonError(
        "HORIZON_UNAVAILABLE",
        "Stellar history is temporarily unavailable. Please retry.",
      );
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new HorizonError(
        "INVALID_HORIZON_RESPONSE",
        "Stellar returned an invalid history response.",
      );
    }
    const parsed = pageSchema.safeParse(json);
    if (!parsed.success || parsed.data._embedded.records.length > pageSize)
      throw new HorizonError(
        "INVALID_HORIZON_RESPONSE",
        "Stellar returned an invalid history response.",
      );
    const records = parsed.data._embedded.records;
    for (const record of records) {
      if (BigInt(record.paging_token) <= BigInt(cursor))
        throw new HorizonError(
          "INVALID_HORIZON_RESPONSE",
          "Stellar pagination did not advance.",
        );
      cursor = record.paging_token;
      if (record.type !== "payment") {
        unsupportedCount++;
        continue;
      }
      // Horizon join=transactions returns the parent transaction in `transaction`.
      try {
        payments.push(parsePayment(record));
      } catch {
        throw new HorizonError(
          "INVALID_HORIZON_RESPONSE",
          "Stellar returned an unsupported payment shape.",
        );
      }
    }
    if (records.length < pageSize)
      return { payments, cursor, hasMore: false, unsupportedCount };
  }
  return { payments, cursor, hasMore: true, unsupportedCount };
}
export async function fetchStellarPayments(
  address: string,
  options: FetchOptions = { network: "testnet" },
): Promise<RawPayment[]> {
  const result = await fetchStellarActivity(address, options);
  if (result.hasMore)
    throw new ProcessingError(
      "INVALID_REQUEST",
      "History exceeds this fetch bound; use cursor-aware fetchStellarActivity.",
    );
  return result.payments;
}
