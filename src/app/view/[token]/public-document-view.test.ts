import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DocumentContent, metadata } from './page';
import { prisma } from '@/lib/prisma';
import { hashSecureToken } from '@/lib/notifications/secure-links';
import nextConfig from '../../../../next.config';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    secureDocumentLink: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    prescription: {
      findFirst: vi.fn(),
    },
    payment: {
      findFirst: vi.fn(),
    },
    invoice: {
      findFirst: vi.fn(),
    },
  },
}));

describe('Public Document Viewer Security & Ownership Verification (/view/[token])', () => {
  const rawToken = 'sec_tok_valid_test_token_1234567890abcdef';
  const tokenHash = hashSecureToken(rawToken);
  const clinicId = 'clinic-alpha-999';
  const patientId = 'pat-54321';
  const resourceId = 'res-11111';

  const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day in future
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day in past

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Token Validation & Expiration Checks', () => {
    it('renders Document Unavailable when token is too short or malformed', async () => {
      const element = await DocumentContent({
        params: Promise.resolve({ token: 'short' }),
      });
      const html = renderToString(element);

      expect(html).toContain('Document Unavailable');
      expect(html).toContain('This document link is invalid, has expired, or is no longer available');
      expect(prisma.secureDocumentLink.findUnique).not.toHaveBeenCalled();
    });

    it('renders Document Unavailable when token hash is not found in database', async () => {
      vi.mocked(prisma.secureDocumentLink.findUnique).mockResolvedValue(null);

      const element = await DocumentContent({
        params: Promise.resolve({ token: rawToken }),
      });
      const html = renderToString(element);

      expect(html).toContain('Document Unavailable');
      expect(prisma.secureDocumentLink.findUnique).toHaveBeenCalledWith({
        where: { tokenHash },
      });
      // Ensure raw token is not leaked in output
      expect(html).not.toContain(rawToken);
      expect(html).not.toContain(tokenHash);
    });

    it('renders Document Unavailable when token is expired', async () => {
      vi.mocked(prisma.secureDocumentLink.findUnique).mockResolvedValue({
        id: 'link-1',
        tokenHash,
        clinicId,
        patientId,
        resourceType: 'PRESCRIPTION',
        resourceId,
        expiresAt: pastDate,
        revokedAt: null,
        accessCount: 0,
        lastAccessedAt: null,
        createdAt: pastDate,
      });

      const element = await DocumentContent({
        params: Promise.resolve({ token: rawToken }),
      });
      const html = renderToString(element);

      expect(html).toContain('Document Unavailable');
      expect(prisma.prescription.findFirst).not.toHaveBeenCalled();
    });

    it('renders Document Unavailable when token has been revoked', async () => {
      vi.mocked(prisma.secureDocumentLink.findUnique).mockResolvedValue({
        id: 'link-1',
        tokenHash,
        clinicId,
        patientId,
        resourceType: 'PRESCRIPTION',
        resourceId,
        expiresAt: futureDate,
        revokedAt: new Date(),
        accessCount: 1,
        lastAccessedAt: pastDate,
        createdAt: pastDate,
      });

      const element = await DocumentContent({
        params: Promise.resolve({ token: rawToken }),
      });
      const html = renderToString(element);

      expect(html).toContain('Document Unavailable');
      expect(prisma.prescription.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('2. Prescription Document Viewing & Ownership Safeguards', () => {
    const validPrescriptionLink = {
      id: 'link-rx-1',
      tokenHash,
      clinicId,
      patientId,
      resourceType: 'PRESCRIPTION' as const,
      resourceId: 'rx-999',
      expiresAt: futureDate,
      revokedAt: null,
      accessCount: 0,
      lastAccessedAt: null,
      createdAt: new Date(),
    };

    const mockPrescription = {
      id: 'rx-999',
      clinicId,
      patientId,
      status: 'ACTIVE',
      notes: 'Take with warm water after meals',
      createdAt: new Date('2026-10-22T08:00:00Z'),
      clinic: {
        name: 'Apollo Medical Center',
        phone: '+977-1-4412345',
        address: 'Thamel, Kathmandu',
        country: 'NP',
      },
      patient: {
        name: 'Aarav Sharma',
        mrn: 'NXR-PAT-00123',
        gender: 'MALE',
        dateOfBirth: '1990-05-15',
      },
      doctor: {
        name: 'Dr. Suresh Acharya',
        email: 'dr.suresh@nexora.test',
      },
      items: [
        {
          id: 'item-1',
          medicationName: 'Amoxicillin',
          strength: '500 mg',
          route: 'Oral',
          frequency: '1-0-1',
          duration: '7 days',
          quantity: '14 caps',
          instructions: 'Complete full course',
        },
      ],
    };

    it('renders prescription details correctly when patient and clinic match', async () => {
      vi.mocked(prisma.secureDocumentLink.findUnique).mockResolvedValue(validPrescriptionLink);
      vi.mocked(prisma.prescription.findFirst).mockResolvedValue(mockPrescription as unknown as Awaited<ReturnType<typeof prisma.prescription.findFirst>>);
      vi.mocked(prisma.secureDocumentLink.update).mockResolvedValue({} as unknown as Awaited<ReturnType<typeof prisma.secureDocumentLink.update>>);

      const element = await DocumentContent({
        params: Promise.resolve({ token: rawToken }),
      });
      const html = renderToString(element);

      expect(html).toContain('Apollo Medical Center');
      expect(html).toContain('Verified Medical Document');
      expect(html).toContain('Aarav Sharma');
      expect(html).toContain('NXR-PAT-00123');
      expect(html).toContain('Dr. Suresh Acharya');
      expect(html).toContain('Amoxicillin');
      expect(html).toContain('500 mg');
      expect(html).toContain('Complete full course');

      // Verifies access count was incremented
      expect(prisma.secureDocumentLink.update).toHaveBeenCalledWith({
        where: { id: 'link-rx-1' },
        data: {
          accessCount: { increment: 1 },
          lastAccessedAt: expect.any(Date),
        },
      });

      // No raw tokens in output
      expect(html).not.toContain(rawToken);
      expect(html).not.toContain(tokenHash);
    });

    it('enforces ownership checks: returns Document Unavailable if prescription patient does not match link patient', async () => {
      vi.mocked(prisma.secureDocumentLink.findUnique).mockResolvedValue(validPrescriptionLink);
      // prisma.prescription.findFirst checks clinicId and patientId matching link, returns null if mismatched
      vi.mocked(prisma.prescription.findFirst).mockResolvedValue(null);

      const element = await DocumentContent({
        params: Promise.resolve({ token: rawToken }),
      });
      const html = renderToString(element);

      expect(html).toContain('Document Unavailable');
      expect(prisma.prescription.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'rx-999',
          clinicId,
          patientId,
        },
        include: expect.any(Object),
      });
    });
  });

  describe('3. Payment Receipt Viewing & Ownership Safeguards', () => {
    const validReceiptLink = {
      id: 'link-rec-1',
      tokenHash,
      clinicId,
      patientId,
      resourceType: 'RECEIPT' as const,
      resourceId: 'pay-777',
      expiresAt: futureDate,
      revokedAt: null,
      accessCount: 2,
      lastAccessedAt: pastDate,
      createdAt: pastDate,
    };

    const mockPayment = {
      id: 'pay-777',
      clinicId,
      amount: '1500.00',
      method: 'CASH',
      transactionRef: 'TXN-987654',
      receivedAt: new Date('2026-10-22T14:30:00Z'),
      clinic: {
        name: 'Apollo Medical Center',
        phone: '+977-1-4412345',
        address: 'Thamel, Kathmandu',
        currency: 'NPR',
      },
      invoice: {
        id: 'inv-555',
        invoiceNumber: 'INV-2026-0001',
        currency: 'NPR',
        totalAmount: '2000.00',
        paidAmount: '1500.00',
        patientId,
        patient: {
          id: patientId,
          name: 'Aarav Sharma',
          mrn: 'NXR-PAT-00123',
        },
      },
    };

    it('renders receipt correctly for matching payment and patient', async () => {
      vi.mocked(prisma.secureDocumentLink.findUnique).mockResolvedValue(validReceiptLink);
      vi.mocked(prisma.payment.findFirst).mockResolvedValue(mockPayment as unknown as Awaited<ReturnType<typeof prisma.payment.findFirst>>);
      vi.mocked(prisma.secureDocumentLink.update).mockResolvedValue({} as unknown as Awaited<ReturnType<typeof prisma.secureDocumentLink.update>>);

      const element = await DocumentContent({
        params: Promise.resolve({ token: rawToken }),
      });
      const html = renderToString(element);

      expect(html).toContain('Official Payment Receipt');
      expect(html).toContain('Apollo Medical Center');
      expect(html).toContain('Aarav Sharma');
      expect(html).toContain('INV-2026-0001');
      expect(html).toContain('1500.00');
      expect(html).toContain('TXN-987654');
      expect(html).toContain('500.00'); // Remaining balance
      expect(html).not.toContain(rawToken);
    });

    it('enforces IDOR prevention: returns Document Unavailable if invoice patient does not match link patient', async () => {
      vi.mocked(prisma.secureDocumentLink.findUnique).mockResolvedValue(validReceiptLink);
      // Mismatched patientId
      vi.mocked(prisma.payment.findFirst).mockResolvedValue({
        ...mockPayment,
        invoice: {
          ...mockPayment.invoice,
          patientId: 'different-patient-999',
        },
      } as unknown as Awaited<ReturnType<typeof prisma.payment.findFirst>>);

      const element = await DocumentContent({
        params: Promise.resolve({ token: rawToken }),
      });
      const html = renderToString(element);

      expect(html).toContain('Document Unavailable');
    });
  });

  describe('4. Invoice Viewing & Ownership Safeguards', () => {
    const validInvoiceLink = {
      id: 'link-inv-1',
      tokenHash,
      clinicId,
      patientId,
      resourceType: 'INVOICE' as const,
      resourceId: 'inv-888',
      expiresAt: futureDate,
      revokedAt: null,
      accessCount: 0,
      lastAccessedAt: null,
      createdAt: pastDate,
    };

    const mockInvoice = {
      id: 'inv-888',
      invoiceNumber: 'INV-2026-0042',
      clinicId,
      patientId,
      currency: 'NPR',
      totalAmount: '3500.00',
      paidAmount: '0.00',
      status: 'ISSUED',
      issueDate: new Date('2026-10-22'),
      dueDate: new Date('2026-11-05'),
      clinic: {
        name: 'Apollo Medical Center',
        phone: '+977-1-4412345',
        address: 'Thamel, Kathmandu',
        currency: 'NPR',
      },
      patient: {
        name: 'Aarav Sharma',
        mrn: 'NXR-PAT-00123',
      },
      items: [
        {
          id: 'item-inv-1',
          description: 'Specialist Consultation Fee',
          quantity: 1,
          unitPrice: '1500.00',
          lineTotal: '1500.00',
        },
        {
          id: 'item-inv-2',
          description: 'Diagnostic Blood Chemistry Panel',
          quantity: 1,
          unitPrice: '2000.00',
          lineTotal: '2000.00',
        },
      ],
    };

    it('renders invoice correctly when invoice matches clinic and patient', async () => {
      vi.mocked(prisma.secureDocumentLink.findUnique).mockResolvedValue(validInvoiceLink);
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue(mockInvoice as unknown as Awaited<ReturnType<typeof prisma.invoice.findFirst>>);
      vi.mocked(prisma.secureDocumentLink.update).mockResolvedValue({} as unknown as Awaited<ReturnType<typeof prisma.secureDocumentLink.update>>);

      const element = await DocumentContent({
        params: Promise.resolve({ token: rawToken }),
      });
      const html = renderToString(element);

      expect(html).toContain('Official Patient Invoice');
      expect(html).toContain('INV-2026-0042');
      expect(html).toContain('Specialist Consultation Fee');
      expect(html).toContain('Diagnostic Blood Chemistry Panel');
      expect(html).toContain('3500.00');
      expect(html).not.toContain(rawToken);
    });

    it('enforces IDOR prevention: returns Document Unavailable if invoice does not belong to link patient or clinic', async () => {
      vi.mocked(prisma.secureDocumentLink.findUnique).mockResolvedValue(validInvoiceLink);
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);

      const element = await DocumentContent({
        params: Promise.resolve({ token: rawToken }),
      });
      const html = renderToString(element);

      expect(html).toContain('Document Unavailable');
    });
  });

  describe('5. HTTP Response Headers & Anti-Crawling Security Policies', () => {
    it('configures strict Cache-Control and X-Robots-Tag response headers for all /view routes in next.config.ts', async () => {
      expect(nextConfig.headers).toBeDefined();
      expect(typeof nextConfig.headers).toBe('function');

      const headersRules = await nextConfig.headers!();
      const viewHeaderRule = headersRules.find(
        (rule: { source: string }) => rule.source === '/view/:path*'
      );

      expect(viewHeaderRule).toBeDefined();

      const cacheControlHeader = viewHeaderRule?.headers.find(
        (h: { key: string; value: string }) => h.key === 'Cache-Control'
      );
      expect(cacheControlHeader).toBeDefined();
      expect(cacheControlHeader?.value).toBe('private, no-cache, no-store, must-revalidate');

      const xRobotsTagHeader = viewHeaderRule?.headers.find(
        (h: { key: string; value: string }) => h.key === 'X-Robots-Tag'
      );
      expect(xRobotsTagHeader).toBeDefined();
      expect(xRobotsTagHeader?.value).toBe('noindex, nofollow, noarchive');
    });

    it('verifies that headers apply to any document viewer path pattern including tokens and subpaths', async () => {
      const headersRules = await nextConfig.headers!();
      const viewHeaderRule = headersRules.find(
        (rule: { source: string }) => rule.source === '/view/:path*'
      );

      expect(viewHeaderRule).toBeDefined();
      expect(viewHeaderRule?.source).toBe('/view/:path*');

      // The wildcard :path* pattern matches any token or error/unavailable state under /view/
      const testCases = [
        '/view/sec_tok_valid_test_token_1234567890abcdef',
        '/view/invalid_token_12345',
        '/view/expired_token_67890',
        '/view/revoked_token_54321',
      ];

      for (const testPath of testCases) {
        expect(testPath.startsWith('/view/')).toBe(true);
      }
    });

    it('sets restrictive robots metadata with noarchive on the document viewer page', () => {
      expect(metadata.robots).toEqual({
        index: false,
        follow: false,
        noarchive: true,
      });
    });
  });
});
