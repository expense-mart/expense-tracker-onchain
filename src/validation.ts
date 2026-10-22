import { StrKey } from "@stellar/stellar-sdk/base";
import { z } from "zod";
import { ProcessingError } from "./errors.js";

export type ValidationResult =
  | { success: true; address: string }
  | {
      success: false;
      error: { code: "INVALID_WALLET_ADDRESS"; message: string };
    };

export function validateStellarAddress(address: unknown): ValidationResult {
  if (typeof address === "string" && StrKey.isValidEd25519PublicKey(address)) {
    return { success: true, address };
  }
  return {
    success: false,
    error: {
      code: "INVALID_WALLET_ADDRESS",
      message: "Enter a valid Stellar public wallet address.",
    },
  };
}

export function requireAddress(address: unknown): string {
  const result = validateStellarAddress(address);
  if (!result.success)
    throw new ProcessingError(result.error.code, result.error.message);
  return result.address;
}

const address = z
  .string()
  .refine((value) => validateStellarAddress(value).success);
// Stellar classic asset values have seven fractional places and signed int64 stroop units.
const amountPattern = /^(0|[1-9]\d{0,11})(\.\d{1,7})?$/;
export const amountSchema = z
  .string()
  .regex(amountPattern)
  .refine(
    (value) =>
      amountPattern.test(value) && toUnits(value) <= 9223372036854775807n,
  );
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const operationId = z.string().regex(/^[1-9]\d{0,29}$/);
const asset = z.discriminatedUnion("asset_type", [
  z.object({ asset_type: z.literal("native") }),
  z.object({
    asset_type: z.literal("credit_alphanum4"),
    asset_code: z.string().regex(/^[a-zA-Z0-9]{1,4}$/),
    asset_issuer: address,
  }),
  z.object({
    asset_type: z.literal("credit_alphanum12"),
    asset_code: z.string().regex(/^[a-zA-Z0-9]{5,12}$/),
    asset_issuer: address,
  }),
]);

/** A Horizon payment enriched with transaction metadata by the caller (no URL fetching). */
export const rawPaymentSchema = z
  .object({
    id: operationId,
    type: z.literal("payment"),
    transaction_hash: hash,
    created_at: z.iso.datetime(),
    from: address,
    to: address,
    amount: amountSchema.refine(
      (value) => amountPattern.test(value) && toUnits(value) > 0n,
    ),
    transaction: z
      .object({
        hash,
        successful: z.literal(true),
        fee_charged: z
          .string()
          .regex(/^(0|[1-9]\d{0,18})$/)
          .refine(
            (value) =>
              /^(0|[1-9]\d{0,18})$/.test(value) &&
              BigInt(value) <= 9223372036854775807n,
          ),
        fee_account: address,
        memo: z.string().max(256).optional(),
      })
      .optional(),
  })
  .and(asset);
export type RawPayment = z.infer<typeof rawPaymentSchema>;

export const normalizedTransactionSchema = z
  .object({
    id: z.string().min(1),
    source: z.literal("onchain"),
    network: z.literal("stellar"),
    walletAddress: address,
    transactionHash: hash,
    operationId: z.string().min(1).optional(),
    direction: z.enum(["incoming", "outgoing", "internal", "unknown"]),
    type: z.enum(["income", "expense", "transfer", "fee", "unknown"]),
    assetCode: z.string().min(1).max(12),
    assetIssuer: address.optional(),
    amount: amountSchema,
    fee: amountSchema.optional(),
    counterparty: address.optional(),
    memo: z.string().max(256).optional(),
    occurredAt: z.iso.datetime(),
  })
  .strict();
export type NormalizedOnchainTransaction = z.infer<
  typeof normalizedTransactionSchema
>;

export function parsePayment(input: unknown): RawPayment {
  if (
    typeof input === "object" &&
    input !== null &&
    "type" in input &&
    input.type !== "payment"
  ) {
    throw new ProcessingError(
      "UNSUPPORTED_OPERATION",
      "Only classic payment operations are supported in this preview.",
    );
  }
  const result = rawPaymentSchema.safeParse(input);
  if (!result.success)
    throw new ProcessingError(
      "INVALID_PAYMENT",
      "Payment fields are invalid or incomplete.",
    );
  if (
    result.data.transaction &&
    result.data.transaction.hash !== result.data.transaction_hash
  ) {
    throw new ProcessingError(
      "INVALID_PAYMENT",
      "Payment and transaction hashes must agree.",
    );
  }
  return result.data;
}

export function toUnits(value: string): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 10000000n + BigInt(fraction.padEnd(7, "0"));
}
export function fromUnits(value: bigint): string {
  const whole = value / 10000000n;
  const fraction = (value % 10000000n)
    .toString()
    .padStart(7, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
