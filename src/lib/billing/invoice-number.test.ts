import { describe, it, expect, vi } from 'vitest';
import {
  formatInvoiceNumber,
  parseInvoiceNumber,
  isValidInvoiceNumber,
  allocateNextInvoiceNumber,
  InvoiceSequenceClient,
} from './invoice-number';

describe('Invoice Numbering Utility', () => {
  describe('formatInvoiceNumber', () => {
    it('formats single-digit sequence with 4-digit zero-padding', () => {
      expect(formatInvoiceNumber(2026, 1)).toBe('INV-2026-0001');
    });

    it('formats double and triple-digit sequences with proper padding', () => {
      expect(formatInvoiceNumber(2026, 42)).toBe('INV-2026-0042');
      expect(formatInvoiceNumber(2026, 789)).toBe('INV-2026-0789');
    });

    it('formats exactly four digits without extra padding', () => {
      expect(formatInvoiceNumber(2026, 1000)).toBe('INV-2026-1000');
      expect(formatInvoiceNumber(2026, 9999)).toBe('INV-2026-9999');
    });

    it('does not truncate sequences exceeding 4 digits', () => {
      expect(formatInvoiceNumber(2026, 10000)).toBe('INV-2026-10000');
      expect(formatInvoiceNumber(2026, 123456)).toBe('INV-2026-123456');
    });

    it('handles different valid years deterministically', () => {
      expect(formatInvoiceNumber(2024, 15)).toBe('INV-2024-0015');
      expect(formatInvoiceNumber(2030, 1)).toBe('INV-2030-0001');
    });

    it('rejects years outside the 2000-2099 range', () => {
      expect(() => formatInvoiceNumber(1999, 1)).toThrow(/Invalid year/);
      expect(() => formatInvoiceNumber(2100, 1)).toThrow(/Invalid year/);
      expect(() => formatInvoiceNumber(26, 1)).toThrow(/Invalid year/);
    });

    it('rejects non-integer or NaN years', () => {
      expect(() => formatInvoiceNumber(2026.5, 1)).toThrow(/Invalid year/);
      expect(() => formatInvoiceNumber(NaN, 1)).toThrow(/Invalid year/);
    });

    it('rejects sequences less than 1 or non-integers', () => {
      expect(() => formatInvoiceNumber(2026, 0)).toThrow(/Invalid sequence/);
      expect(() => formatInvoiceNumber(2026, -5)).toThrow(/Invalid sequence/);
      expect(() => formatInvoiceNumber(2026, 1.5)).toThrow(/Invalid sequence/);
      expect(() => formatInvoiceNumber(2026, NaN)).toThrow(/Invalid sequence/);
    });
  });

  describe('parseInvoiceNumber', () => {
    it('correctly parses valid invoice numbers into year and sequence', () => {
      expect(parseInvoiceNumber('INV-2026-0001')).toEqual({
        year: 2026,
        sequence: 1,
      });
      expect(parseInvoiceNumber('INV-2026-0042')).toEqual({
        year: 2026,
        sequence: 42,
      });
      expect(parseInvoiceNumber('INV-2025-9999')).toEqual({
        year: 2025,
        sequence: 9999,
      });
      expect(parseInvoiceNumber('INV-2026-10000')).toEqual({
        year: 2026,
        sequence: 10000,
      });
    });

    it('trims leading/trailing whitespace before parsing', () => {
      expect(parseInvoiceNumber('  INV-2026-0005  ')).toEqual({
        year: 2026,
        sequence: 5,
      });
    });

    it('throws on non-string input', () => {
      // @ts-expect-error testing runtime validation
      expect(() => parseInvoiceNumber(null)).toThrow(/Invalid invoice number input/);
      // @ts-expect-error testing runtime validation
      expect(() => parseInvoiceNumber(12345)).toThrow(/Invalid invoice number input/);
    });

    it('throws on malformed format or missing prefix', () => {
      expect(() => parseInvoiceNumber('2026-0001')).toThrow(/Invalid invoice number format/);
      expect(() => parseInvoiceNumber('INV2026-0001')).toThrow(/Invalid invoice number format/);
      expect(() => parseInvoiceNumber('INV-26-0001')).toThrow(/Invalid invoice number format/);
      expect(() => parseInvoiceNumber('INV-2026-1')).toThrow(/Invalid invoice number format/); // sequence must be at least 4 digits
      expect(() => parseInvoiceNumber('INV-2026-0000')).toThrow(/Invalid sequence/); // sequence 0 is invalid
      expect(() => parseInvoiceNumber('INV-2026-ABCD')).toThrow(/Invalid invoice number format/);
      expect(() => parseInvoiceNumber('')).toThrow(/Invalid invoice number format/);
    });
  });

  describe('isValidInvoiceNumber', () => {
    it('returns true for valid invoice numbers', () => {
      expect(isValidInvoiceNumber('INV-2026-0001')).toBe(true);
      expect(isValidInvoiceNumber('INV-2024-0500')).toBe(true);
      expect(isValidInvoiceNumber('INV-2026-10500')).toBe(true);
    });

    it('returns false for invalid structures or types', () => {
      expect(isValidInvoiceNumber('INV-2026-0000')).toBe(false);
      expect(isValidInvoiceNumber('INV-2026-1')).toBe(false);
      expect(isValidInvoiceNumber('INV-1999-0001')).toBe(false);
      expect(isValidInvoiceNumber('INV-2100-0001')).toBe(false);
      expect(isValidInvoiceNumber('INV-2026-XYZ1')).toBe(false);
      expect(isValidInvoiceNumber('')).toBe(false);
      expect(isValidInvoiceNumber(null)).toBe(false);
      expect(isValidInvoiceNumber(undefined)).toBe(false);
      expect(isValidInvoiceNumber(20260001)).toBe(false);
      expect(isValidInvoiceNumber({})).toBe(false);
    });
  });

  describe('allocateNextInvoiceNumber', () => {
    it('allocates the first sequence (1) for a new clinic/year', async () => {
      const mockDb: InvoiceSequenceClient = {
        invoiceSequence: {
          upsert: vi.fn().mockResolvedValue({ lastSequence: 1 }),
        },
      };

      const result = await allocateNextInvoiceNumber(mockDb, 'clinic-123', 2026);

      expect(result).toEqual({
        sequence: 1,
        invoiceNumber: 'INV-2026-0001',
      });

      expect(mockDb.invoiceSequence.upsert).toHaveBeenCalledWith({
        where: {
          clinicId_year: {
            clinicId: 'clinic-123',
            year: 2026,
          },
        },
        create: {
          clinicId: 'clinic-123',
          year: 2026,
          lastSequence: 1,
        },
        update: {
          lastSequence: {
            increment: 1,
          },
        },
        select: {
          lastSequence: true,
        },
      });
    });

    it('formats existing sequence increments correctly', async () => {
      const mockDb: InvoiceSequenceClient = {
        invoiceSequence: {
          upsert: vi.fn().mockResolvedValue({ lastSequence: 42 }),
        },
      };

      const result = await allocateNextInvoiceNumber(mockDb, 'clinic-abc', 2026);

      expect(result).toEqual({
        sequence: 42,
        invoiceNumber: 'INV-2026-0042',
      });
    });

    it('simulates concurrent atomic sequence allocations safely without duplicates', async () => {
      let currentSeq = 0;
      // Simulate PostgreSQL atomic upsert behavior where each request acquires the row lock
      const mockDb: InvoiceSequenceClient = {
        invoiceSequence: {
          upsert: vi.fn().mockImplementation(async () => {
            currentSeq += 1;
            return { lastSequence: currentSeq };
          }),
        },
      };

      // Dispatch 10 concurrent requests simultaneously
      const promises = Array.from({ length: 10 }, () =>
        allocateNextInvoiceNumber(mockDb, 'clinic-concurrent', 2026)
      );

      const results = await Promise.all(promises);

      // Verify each result received a distinct sequence and valid invoice number
      const sequences = results.map((r) => r.sequence);
      const invoiceNumbers = results.map((r) => r.invoiceNumber);

      expect(sequences).toHaveLength(10);
      expect(new Set(sequences).size).toBe(10);
      expect(sequences.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      expect(invoiceNumbers).toHaveLength(10);
      expect(new Set(invoiceNumbers).size).toBe(10);
      expect(invoiceNumbers).toContain('INV-2026-0001');
      expect(invoiceNumbers).toContain('INV-2026-0010');
    });

    it('rejects invalid or empty clinicId', async () => {
      const mockDb: InvoiceSequenceClient = {
        invoiceSequence: {
          upsert: vi.fn(),
        },
      };

      await expect(allocateNextInvoiceNumber(mockDb, '', 2026)).rejects.toThrow(
        /clinicId is required/
      );
      // @ts-expect-error testing runtime validation
      await expect(allocateNextInvoiceNumber(mockDb, null, 2026)).rejects.toThrow(
        /clinicId is required/
      );
    });

    it('rejects invalid year', async () => {
      const mockDb: InvoiceSequenceClient = {
        invoiceSequence: {
          upsert: vi.fn(),
        },
      };

      await expect(allocateNextInvoiceNumber(mockDb, 'clinic-123', 1999)).rejects.toThrow(
        /Invalid year/
      );
    });
  });
});
