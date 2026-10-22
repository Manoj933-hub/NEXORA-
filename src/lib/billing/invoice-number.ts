/**
 * Invoice Numbering Utility for NEXORA
 *
 * Implements deterministic, year-based invoice number formatting, validation,
 * parsing, and atomic concurrency-safe sequence allocation scoped by clinic and year.
 *
 * Format: INV-YYYY-NNNN (e.g., INV-2026-0001)
 */

export const INVOICE_NUMBER_REGEX = /^INV-(\d{4})-(\d{4,})$/;

export function validateYear(year: number): void {
  if (
    typeof year !== 'number' ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2099
  ) {
    throw new Error(`Invalid year: "${year}". Year must be a 4-digit integer between 2000 and 2099.`);
  }
}

export function validateSequence(sequence: number): void {
  if (
    typeof sequence !== 'number' ||
    !Number.isInteger(sequence) ||
    sequence < 1
  ) {
    throw new Error(`Invalid sequence: "${sequence}". Sequence must be an integer >= 1.`);
  }
}

/**
 * Pure function to format an invoice number given year and sequence.
 * Scoped to each clinic and year. Pads sequence to at least 4 digits.
 */
export function formatInvoiceNumber(year: number, sequence: number): string {
  validateYear(year);
  validateSequence(sequence);

  const paddedSequence = sequence.toString().padStart(4, '0');
  return `INV-${year}-${paddedSequence}`;
}

/**
 * Validates whether a value is a valid NEXORA invoice number format.
 */
export function isValidInvoiceNumber(invoiceNumber: unknown): boolean {
  if (typeof invoiceNumber !== 'string') return false;
  const match = invoiceNumber.trim().match(INVOICE_NUMBER_REGEX);
  if (!match) return false;

  const year = parseInt(match[1], 10);
  const sequence = parseInt(match[2], 10);

  return (
    Number.isInteger(year) &&
    year >= 2000 &&
    year <= 2099 &&
    Number.isInteger(sequence) &&
    sequence >= 1
  );
}

/**
 * Parses an invoice number into its year and sequence components.
 * Throws if the format is invalid.
 */
export function parseInvoiceNumber(invoiceNumber: string): {
  year: number;
  sequence: number;
} {
  if (typeof invoiceNumber !== 'string') {
    throw new Error(`Invalid invoice number input: expected string, received ${typeof invoiceNumber}`);
  }

  const match = invoiceNumber.trim().match(INVOICE_NUMBER_REGEX);
  if (!match) {
    throw new Error(
      `Invalid invoice number format: "${invoiceNumber}". Expected format: INV-YYYY-NNNN (e.g. INV-2026-0001).`
    );
  }

  const year = parseInt(match[1], 10);
  const sequence = parseInt(match[2], 10);

  validateYear(year);
  validateSequence(sequence);

  return { year, sequence };
}

/**
 * Minimal duck-typed interface for PrismaClient or TransactionClient
 * supporting atomic upsert on invoice sequences.
 */
export interface InvoiceSequenceClient {
  invoiceSequence: {
    upsert: (args: {
      where: {
        clinicId_year: {
          clinicId: string;
          year: number;
        };
      };
      create: {
        clinicId: string;
        year: number;
        lastSequence: number;
      };
      update: {
        lastSequence: {
          increment: number;
        };
      };
      select: {
        lastSequence: true;
      };
    }) => Promise<{ lastSequence: number }>;
  };
}

/**
 * Atomically allocates the next invoice number for a given clinic and year.
 *
 * Concurrency safety:
 * Uses PostgreSQL's atomic upsert (`INSERT ... ON CONFLICT (clinic_id, year) DO UPDATE SET last_sequence = last_sequence + 1`)
 * which acquires an exclusive row-level lock on the `(clinic_id, year)` row.
 * This guarantees strict sequential monotonicity under high concurrent volume without race conditions
 * or sequence reuse.
 *
 * @param db - Prisma client or interactive transaction client
 * @param clinicId - Scoped clinic ID
 * @param year - Explicit year (ensures deterministic testing without relying on machine clock)
 */
export async function allocateNextInvoiceNumber(
  db: InvoiceSequenceClient,
  clinicId: string,
  year: number
): Promise<{ sequence: number; invoiceNumber: string }> {
  if (!clinicId || typeof clinicId !== 'string' || clinicId.trim() === '') {
    throw new Error('clinicId is required for invoice sequence allocation');
  }

  validateYear(year);

  const result = await db.invoiceSequence.upsert({
    where: {
      clinicId_year: {
        clinicId: clinicId.trim(),
        year,
      },
    },
    create: {
      clinicId: clinicId.trim(),
      year,
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

  return {
    sequence: result.lastSequence,
    invoiceNumber: formatInvoiceNumber(year, result.lastSequence),
  };
}
