import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  calculateLineTotal,
  calculateSubtotal,
  validateDiscount,
  calculateTaxAmount,
  calculateInvoiceTotals,
  calculateBalanceDue,
  toDecimal,
  roundCurrency,
} from './invoice-calculator';

describe('Invoice Calculator (Exact Monetary Calculations)', () => {
  describe('toDecimal and roundCurrency', () => {
    it('converts number, string, and Decimal inputs reliably', () => {
      expect(toDecimal(12.34).toString()).toBe('12.34');
      expect(toDecimal('500.50').toString()).toBe('500.5');
      expect(toDecimal(new Prisma.Decimal('100.25')).toString()).toBe('100.25');
    });

    it('rejects invalid or non-numeric inputs', () => {
      // @ts-expect-error testing runtime validation
      expect(() => toDecimal(null)).toThrow(/cannot be null/);
      // @ts-expect-error testing runtime validation
      expect(() => toDecimal(undefined)).toThrow(/cannot be null/);
      expect(() => toDecimal('abc')).toThrow(/not a valid number/);
      expect(() => toDecimal(NaN)).toThrow(/not a valid number/);
    });

    it('implements strict ROUND_HALF_UP rounding to 2 decimal places', () => {
      // 0.005 rounds up to 0.01
      expect(roundCurrency(new Prisma.Decimal('10.005')).toString()).toBe('10.01');
      // 0.004 rounds down to 0.00
      expect(roundCurrency(new Prisma.Decimal('10.004')).toString()).toBe('10');
      // 0.0051 rounds up to 0.01
      expect(roundCurrency(new Prisma.Decimal('10.0051')).toString()).toBe('10.01');
      // Standard half-up: 2.555 -> 2.56
      expect(roundCurrency(new Prisma.Decimal('2.555')).toString()).toBe('2.56');
    });
  });

  describe('calculateLineTotal', () => {
    it('computes exact line total for valid quantity and unit price', () => {
      const total = calculateLineTotal(3, '150.00');
      expect(total.toString()).toBe('450');
      expect(total.toFixed(2)).toBe('450.00');
    });

    it('avoids floating-point errors (e.g. 19.99 * 3)', () => {
      // In IEEE 754 JS: 19.99 * 3 = 59.970000000000006
      const total = calculateLineTotal(3, '19.99');
      expect(total.toString()).toBe('59.97');
    });

    it('supports 0.00 unit price for free/complimentary items', () => {
      const total = calculateLineTotal(1, '0.00');
      expect(total.toString()).toBe('0');
      expect(total.toFixed(2)).toBe('0.00');
    });

    it('rejects negative unit prices', () => {
      expect(() => calculateLineTotal(1, '-10.00')).toThrow(/Unit price cannot be negative/);
      expect(() => calculateLineTotal(2, -5)).toThrow(/Unit price cannot be negative/);
    });

    it('rejects quantities less than 1 or non-integers', () => {
      expect(() => calculateLineTotal(0, '100.00')).toThrow(/Quantity must be an integer >= 1/);
      expect(() => calculateLineTotal(-2, '100.00')).toThrow(/Quantity must be an integer >= 1/);
      expect(() => calculateLineTotal(1.5, '100.00')).toThrow(/Quantity must be an integer >= 1/);
      expect(() => calculateLineTotal(NaN, '100.00')).toThrow(/Quantity must be an integer >= 1/);
    });
  });

  describe('calculateSubtotal', () => {
    it('returns 0.00 for empty line items array', () => {
      const subtotal = calculateSubtotal([]);
      expect(subtotal.toFixed(2)).toBe('0.00');
    });

    it('sums multiple line items exactly without floating-point drift', () => {
      // 0.10 + 0.20 in float is 0.30000000000000004
      const items = [
        { quantity: 1, unitPrice: '0.10' },
        { quantity: 1, unitPrice: '0.20' },
      ];
      const subtotal = calculateSubtotal(items);
      expect(subtotal.toString()).toBe('0.3');
      expect(subtotal.toFixed(2)).toBe('0.30');
    });

    it('calculates a multi-item healthcare bill correctly (INR)', () => {
      const items = [
        { quantity: 1, unitPrice: '500.00', description: 'Consultation with Doctor' },
        { quantity: 2, unitPrice: '125.50', description: 'Paracetamol 650mg pack' },
        { quantity: 1, unitPrice: '350.00', description: 'Complete Blood Count (CBC) Lab' },
      ];
      // 500 + 251 + 350 = 1101.00
      const subtotal = calculateSubtotal(items);
      expect(subtotal.toFixed(2)).toBe('1101.00');
    });

    it('rejects non-array input', () => {
      // @ts-expect-error testing runtime validation
      expect(() => calculateSubtotal(null)).toThrow(/must be an array/);
    });
  });

  describe('validateDiscount', () => {
    it('accepts zero discount', () => {
      const disc = validateDiscount('1000.00', '0.00');
      expect(disc.toFixed(2)).toBe('0.00');
    });

    it('accepts partial discount less than subtotal', () => {
      const disc = validateDiscount('1000.00', '150.00');
      expect(disc.toFixed(2)).toBe('150.00');
    });

    it('accepts 100% full discount (discount equal to subtotal)', () => {
      const disc = validateDiscount('1000.00', '1000.00');
      expect(disc.toFixed(2)).toBe('1000.00');
    });

    it('rejects negative discount', () => {
      expect(() => validateDiscount('1000.00', '-50.00')).toThrow(/Discount cannot be negative/);
    });

    it('rejects excessive discount exceeding subtotal', () => {
      expect(() => validateDiscount('1000.00', '1000.01')).toThrow(
        /Discount cannot exceed subtotal/
      );
      expect(() => validateDiscount('500.00', '600.00')).toThrow(
        /Discount cannot exceed subtotal/
      );
    });

    it('rejects negative subtotal', () => {
      expect(() => validateDiscount('-100.00', '0.00')).toThrow(/Subtotal cannot be negative/);
    });
  });

  describe('calculateTaxAmount', () => {
    it('returns 0.00 when tax rate is 0 or taxable amount is 0', () => {
      expect(calculateTaxAmount('500.00', '0.00').toFixed(2)).toBe('0.00');
      expect(calculateTaxAmount('0.00', '18.00').toFixed(2)).toBe('0.00');
    });

    it('calculates 18% GST with ROUND_HALF_UP rounding', () => {
      // 100.05 * 0.18 = 18.009 -> rounds to 18.01
      const tax = calculateTaxAmount('100.05', '18.00');
      expect(tax.toFixed(2)).toBe('18.01');
    });

    it('calculates 5% GST accurately', () => {
      // 10.55 * 0.05 = 0.5275 -> rounds to 0.53
      const tax = calculateTaxAmount('10.55', '5.00');
      expect(tax.toFixed(2)).toBe('0.53');
    });

    it('calculates 13% Nepal VAT accurately', () => {
      // 1200.00 * 0.13 = 156.00
      const tax = calculateTaxAmount('1200.00', '13.00');
      expect(tax.toFixed(2)).toBe('156.00');
    });

    it('accepts maximum boundary tax rate of 100%', () => {
      const tax = calculateTaxAmount('250.00', '100.00');
      expect(tax.toFixed(2)).toBe('250.00');
    });

    it('rejects negative tax rates', () => {
      expect(() => calculateTaxAmount('500.00', '-5.00')).toThrow(/Tax rate cannot be negative/);
    });

    it('rejects tax rates exceeding 100%', () => {
      expect(() => calculateTaxAmount('500.00', '101.00')).toThrow(/Tax rate cannot exceed 100%/);
    });

    it('rejects negative taxable base amounts', () => {
      expect(() => calculateTaxAmount('-100.00', '18.00')).toThrow(
        /Taxable amount cannot be negative/
      );
    });
  });

  describe('calculateInvoiceTotals', () => {
    it('calculates standard invoice totals with discount and tax rate', () => {
      const items = [
        { quantity: 1, unitPrice: '1000.00' },
        { quantity: 2, unitPrice: '250.00' },
      ];
      // Subtotal: 1500.00
      // Discount: 200.00
      // Taxable: 1300.00
      // Tax (18%): 234.00
      // Total: 1534.00
      const totals = calculateInvoiceTotals({
        items,
        discount: '200.00',
        taxRate: '18.00',
      });

      expect(totals.subtotal.toFixed(2)).toBe('1500.00');
      expect(totals.discount.toFixed(2)).toBe('200.00');
      expect(totals.taxableAmount.toFixed(2)).toBe('1300.00');
      expect(totals.taxRate?.toFixed(2)).toBe('18.00');
      expect(totals.taxAmount.toFixed(2)).toBe('234.00');
      expect(totals.totalAmount.toFixed(2)).toBe('1534.00');
    });

    it('calculates invoice with zero discount and null tax rate (non-taxable)', () => {
      const items = [{ quantity: 1, unitPrice: '800.00' }];
      const totals = calculateInvoiceTotals({
        items,
        discount: '0.00',
        taxRate: null,
      });

      expect(totals.subtotal.toFixed(2)).toBe('800.00');
      expect(totals.discount.toFixed(2)).toBe('0.00');
      expect(totals.taxableAmount.toFixed(2)).toBe('800.00');
      expect(totals.taxRate).toBeNull();
      expect(totals.taxAmount.toFixed(2)).toBe('0.00');
      expect(totals.totalAmount.toFixed(2)).toBe('800.00');
    });

    it('handles 100% discount properly resulting in 0 total and 0 tax', () => {
      const items = [{ quantity: 1, unitPrice: '500.00' }];
      const totals = calculateInvoiceTotals({
        items,
        discount: '500.00',
        taxRate: '18.00',
      });

      expect(totals.subtotal.toFixed(2)).toBe('500.00');
      expect(totals.discount.toFixed(2)).toBe('500.00');
      expect(totals.taxableAmount.toFixed(2)).toBe('0.00');
      expect(totals.taxAmount.toFixed(2)).toBe('0.00');
      expect(totals.totalAmount.toFixed(2)).toBe('0.00');
    });
  });

  describe('calculateBalanceDue', () => {
    it('calculates balance when invoice is completely unpaid', () => {
      const result = calculateBalanceDue('1500.00', '0.00');
      expect(result.totalAmount.toFixed(2)).toBe('1500.00');
      expect(result.paidAmount.toFixed(2)).toBe('0.00');
      expect(result.balanceDue.toFixed(2)).toBe('1500.00');
      expect(result.isFullyPaid).toBe(false);
      expect(result.isOverpaid).toBe(false);
    });

    it('calculates balance for partially paid invoice', () => {
      const result = calculateBalanceDue('1500.00', '600.00');
      expect(result.balanceDue.toFixed(2)).toBe('900.00');
      expect(result.isFullyPaid).toBe(false);
      expect(result.isOverpaid).toBe(false);
    });

    it('calculates balance for fully paid invoice', () => {
      const result = calculateBalanceDue('1500.00', '1500.00');
      expect(result.balanceDue.toFixed(2)).toBe('0.00');
      expect(result.isFullyPaid).toBe(true);
      expect(result.isOverpaid).toBe(false);
    });

    it('handles overpayment cleanly without negative balance', () => {
      const result = calculateBalanceDue('1500.00', '1600.00');
      expect(result.balanceDue.toFixed(2)).toBe('0.00');
      expect(result.isFullyPaid).toBe(true);
      expect(result.isOverpaid).toBe(true);
    });

    it('rejects negative totalAmount or paidAmount', () => {
      expect(() => calculateBalanceDue('-100.00', '50.00')).toThrow(
        /Total amount cannot be negative/
      );
      expect(() => calculateBalanceDue('100.00', '-50.00')).toThrow(
        /Paid amount cannot be negative/
      );
    });
  });
});
