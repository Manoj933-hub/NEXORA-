import { Prisma } from '@prisma/client';

/**
 * Exact Monetary Calculations for NEXORA Billing
 *
 * Implements pure financial math using Prisma.Decimal arbitrary-precision arithmetic.
 * Never uses IEEE-754 floating-point operations for currency or monetary totals.
 *
 * Currency standard:
 * - Applicable to INR and NPR currencies (2 decimal places / 100 minor units).
 * - Standard rounding policy: ROUND_HALF_UP (half rounded away from zero / rounded up).
 */

export const CURRENCY_DECIMAL_PLACES = 2;
export const ROUNDING_MODE = Prisma.Decimal.ROUND_HALF_UP;

export type DecimalLike = Prisma.Decimal | string | number;

export interface LineItemInput {
  quantity: number;
  unitPrice: DecimalLike;
  description?: string;
  itemType?: string;
}

export interface CalculatedInvoiceTotals {
  subtotal: Prisma.Decimal;
  discount: Prisma.Decimal;
  taxableAmount: Prisma.Decimal;
  taxRate: Prisma.Decimal | null;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

export interface OutstandingBalanceResult {
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  balanceDue: Prisma.Decimal;
  isFullyPaid: boolean;
  isOverpaid: boolean;
}

/**
 * Coerces and validates a value to a non-NaN, finite Prisma.Decimal.
 */
export function toDecimal(value: DecimalLike, fieldName = 'amount'): Prisma.Decimal {
  if (value === null || value === undefined) {
    throw new Error(`Invalid ${fieldName}: value cannot be null or undefined`);
  }

  try {
    const dec = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
    if (dec.isNaN()) {
      throw new Error(`Invalid ${fieldName}: "${value}" is not a valid number`);
    }
    return dec;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid')) {
      throw error;
    }
    throw new Error(`Invalid ${fieldName}: "${value}" is not a valid number`);
  }
}

/**
 * Rounds a Decimal to 2 decimal places using ROUND_HALF_UP.
 */
export function roundCurrency(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(CURRENCY_DECIMAL_PLACES, ROUNDING_MODE);
}

/**
 * Calculates line item total: quantity * unitPrice.
 *
 * Validations:
 * - Quantity must be an integer >= 1
 * - Unit price must be >= 0
 */
export function calculateLineTotal(quantity: number, unitPrice: DecimalLike): Prisma.Decimal {
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`Invalid quantity: "${quantity}". Quantity must be an integer >= 1.`);
  }

  const price = toDecimal(unitPrice, 'unitPrice');
  if (price.isNegative()) {
    throw new Error(`Invalid unit price: "${price.toString()}". Unit price cannot be negative.`);
  }

  const total = price.times(quantity);
  return roundCurrency(total);
}

/**
 * Calculates subtotal as the exact sum of all line items.
 */
export function calculateSubtotal(items: readonly LineItemInput[]): Prisma.Decimal {
  if (!Array.isArray(items)) {
    throw new Error('Items must be an array');
  }

  let subtotal = new Prisma.Decimal('0.00');

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const lineTotal = calculateLineTotal(item.quantity, item.unitPrice);
    subtotal = subtotal.plus(lineTotal);
  }

  return roundCurrency(subtotal);
}

/**
 * Validates and normalizes discount amount.
 *
 * Rules:
 * - Discount cannot be negative
 * - Discount cannot exceed subtotal
 */
export function validateDiscount(
  subtotal: DecimalLike,
  discount: DecimalLike = 0
): Prisma.Decimal {
  const sub = roundCurrency(toDecimal(subtotal, 'subtotal'));
  if (sub.isNegative()) {
    throw new Error(`Invalid subtotal: "${sub.toString()}". Subtotal cannot be negative.`);
  }

  const disc = roundCurrency(toDecimal(discount, 'discount'));
  if (disc.isNegative()) {
    throw new Error(`Invalid discount: "${disc.toString()}". Discount cannot be negative.`);
  }

  if (disc.greaterThan(sub)) {
    throw new Error(
      `Invalid discount: "${disc.toString()}". Discount cannot exceed subtotal "${sub.toString()}".`
    );
  }

  return disc;
}

/**
 * Calculates tax amount given a taxable base amount and an explicit tax rate percentage.
 *
 * Rules:
 * - Tax rate must be >= 0 and <= 100
 * - Taxable amount must be >= 0
 * - Rounding applied: ROUND_HALF_UP to 2 decimal places
 */
export function calculateTaxAmount(
  taxableAmount: DecimalLike,
  taxRatePercentage: DecimalLike = 0
): Prisma.Decimal {
  const taxable = roundCurrency(toDecimal(taxableAmount, 'taxableAmount'));
  if (taxable.isNegative()) {
    throw new Error(
      `Invalid taxable amount: "${taxable.toString()}". Taxable amount cannot be negative.`
    );
  }

  const rate = toDecimal(taxRatePercentage, 'taxRate');
  if (rate.isNegative()) {
    throw new Error(`Invalid tax rate: "${rate.toString()}". Tax rate cannot be negative.`);
  }

  if (rate.greaterThan(100)) {
    throw new Error(`Invalid tax rate: "${rate.toString()}". Tax rate cannot exceed 100%.`);
  }

  if (rate.isZero() || taxable.isZero()) {
    return new Prisma.Decimal('0.00');
  }

  const tax = taxable.times(rate).dividedBy(100);
  return roundCurrency(tax);
}

/**
 * Calculates all invoice totals in exact Decimal precision.
 *
 * Formula:
 * - subtotal = sum(line items)
 * - discount = validated discount (<= subtotal)
 * - taxableAmount = subtotal - discount
 * - taxAmount = taxableAmount * (taxRate / 100) (if taxRate supplied)
 * - totalAmount = taxableAmount + taxAmount
 */
export function calculateInvoiceTotals(params: {
  items: readonly LineItemInput[];
  discount?: DecimalLike;
  taxRate?: DecimalLike | null;
}): CalculatedInvoiceTotals {
  const subtotal = calculateSubtotal(params.items);
  const discount = validateDiscount(subtotal, params.discount ?? 0);
  const taxableAmount = roundCurrency(subtotal.minus(discount));

  let taxRateDec: Prisma.Decimal | null = null;
  let taxAmount = new Prisma.Decimal('0.00');

  if (params.taxRate !== undefined && params.taxRate !== null) {
    taxRateDec = toDecimal(params.taxRate, 'taxRate');
    taxAmount = calculateTaxAmount(taxableAmount, taxRateDec);
  }

  const totalAmount = roundCurrency(taxableAmount.plus(taxAmount));

  return {
    subtotal,
    discount,
    taxableAmount,
    taxRate: taxRateDec,
    taxAmount,
    totalAmount,
  };
}

/**
 * Calculates outstanding balance and payment status given totalAmount and paidAmount.
 *
 * Rules:
 * - totalAmount >= 0
 * - paidAmount >= 0
 * - balanceDue = max(0, totalAmount - paidAmount)
 */
export function calculateBalanceDue(
  totalAmount: DecimalLike,
  paidAmount: DecimalLike = 0
): OutstandingBalanceResult {
  const total = roundCurrency(toDecimal(totalAmount, 'totalAmount'));
  if (total.isNegative()) {
    throw new Error(
      `Invalid total amount: "${total.toString()}". Total amount cannot be negative.`
    );
  }

  const paid = roundCurrency(toDecimal(paidAmount, 'paidAmount'));
  if (paid.isNegative()) {
    throw new Error(
      `Invalid paid amount: "${paid.toString()}". Paid amount cannot be negative.`
    );
  }

  const diff = total.minus(paid);
  const isFullyPaid = paid.greaterThanOrEqualTo(total);
  const isOverpaid = paid.greaterThan(total);
  const balanceDue = diff.isNegative() ? new Prisma.Decimal('0.00') : roundCurrency(diff);

  return {
    totalAmount: total,
    paidAmount: paid,
    balanceDue,
    isFullyPaid,
    isOverpaid,
  };
}
