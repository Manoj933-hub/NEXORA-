import { describe, it, expect } from 'vitest';
import {
  compileNotificationMessage,
  assertPhiFree,
  calculateSmsSegments,
  PhiViolationError,
} from './templates';

describe('Notification Templates & PHI Minimization Suite', () => {
  describe('Template Compilation', () => {
    it('compiles APPOINTMENT_BOOKED template accurately', () => {
      const msg = compileNotificationMessage({
        eventType: 'APPOINTMENT_BOOKED',
        variables: {
          patientName: 'Rahul Sharma',
          clinicName: 'Apollo Clinic',
          doctorName: 'Dr. Aditi Sharma',
          date: '24 Oct 2026',
          time: '10:30 AM',
          mrn: 'NX-0042',
        },
      });

      expect(msg).toBe(
        'Dear Rahul Sharma, your appointment at Apollo Clinic with Dr. Aditi Sharma is confirmed for 24 Oct 2026 at 10:30 AM. Ref: NX-0042.'
      );
    });

    it('compiles APPOINTMENT_RESCHEDULED template accurately', () => {
      const msg = compileNotificationMessage({
        eventType: 'APPOINTMENT_RESCHEDULED',
        variables: {
          patientName: 'Sita Thapa',
          clinicName: 'Kathmandu Polyclinic',
          doctorName: 'Dr. Ramesh Adhikari',
          date: '25 Oct 2026',
          time: '02:00 PM',
          mrn: 'NX-0105',
        },
      });

      expect(msg).toBe(
        'Dear Sita Thapa, your appointment at Kathmandu Polyclinic with Dr. Ramesh Adhikari has been rescheduled to 25 Oct 2026 at 02:00 PM. Ref: NX-0105.'
      );
    });

    it('compiles APPOINTMENT_CANCELLED template with optional clinic phone', () => {
      const withPhone = compileNotificationMessage({
        eventType: 'APPOINTMENT_CANCELLED',
        variables: {
          patientName: 'Rahul Sharma',
          clinicName: 'Apollo Clinic',
          doctorName: 'Dr. Aditi Sharma',
          date: '24 Oct 2026',
          time: '10:30 AM',
          mrn: 'NX-0042',
          clinicPhone: '+919876543210',
        },
      });
      expect(withPhone).toBe(
        'Dear Rahul Sharma, your appointment at Apollo Clinic on 24 Oct 2026 at 10:30 AM has been cancelled. For queries call +919876543210.'
      );

      const withoutPhone = compileNotificationMessage({
        eventType: 'APPOINTMENT_CANCELLED',
        variables: {
          patientName: 'Rahul Sharma',
          clinicName: 'Apollo Clinic',
          doctorName: 'Dr. Aditi Sharma',
          date: '24 Oct 2026',
          time: '10:30 AM',
          mrn: 'NX-0042',
        },
      });
      expect(withoutPhone).toBe(
        'Dear Rahul Sharma, your appointment at Apollo Clinic on 24 Oct 2026 at 10:30 AM has been cancelled.'
      );
    });

    it('compiles PRESCRIPTION_READY template with secure token link', () => {
      const msg = compileNotificationMessage({
        eventType: 'PRESCRIPTION_READY',
        variables: {
          patientName: 'Aarav Patel',
          clinicName: 'HealthFirst Clinic',
          doctorName: 'Dr. Verma',
          mrn: 'NX-0012',
          viewLink: 'https://nexora.health/view/4f8e2190b1c2d3e4f5a6b7c8d9e0f1a2',
        },
      });

      expect(msg).toBe(
        'Dear Aarav Patel, your prescription from Dr. Verma at HealthFirst Clinic is ready. View securely: https://nexora.health/view/4f8e2190b1c2d3e4f5a6b7c8d9e0f1a2'
      );
    });

    it('compiles PAYMENT_RECEIPT template accurately', () => {
      const msg = compileNotificationMessage({
        eventType: 'PAYMENT_RECEIPT',
        variables: {
          patientName: 'Rahul Sharma',
          clinicName: 'Apollo Clinic',
          invoiceNumber: 'INV-2026-0045',
          currency: '₹',
          amount: '1,500.00',
          viewLink: 'https://nexora.health/view/receipt-token-123',
        },
      });

      expect(msg).toBe(
        'Dear Rahul Sharma, payment of ₹ 1,500.00 received for invoice #INV-2026-0045 at Apollo Clinic. Receipt: https://nexora.health/view/receipt-token-123'
      );
    });

    it('compiles INVOICE_ISSUED template with due date', () => {
      const msg = compileNotificationMessage({
        eventType: 'INVOICE_ISSUED',
        variables: {
          patientName: 'Rahul Sharma',
          clinicName: 'Apollo Clinic',
          invoiceNumber: 'INV-2026-0045',
          currency: 'NPR',
          amount: '3,200.00',
          dueDate: '30 Oct 2026',
          viewLink: 'https://nexora.health/view/invoice-token-123',
        },
      });

      expect(msg).toBe(
        'Dear Rahul Sharma, invoice #INV-2026-0045 for NPR 3,200.00 has been issued by Apollo Clinic. Due: 30 Oct 2026. Details: https://nexora.health/view/invoice-token-123'
      );
    });

    it('sanitizes excessive whitespace and newlines from variable inputs', () => {
      const msg = compileNotificationMessage({
        eventType: 'APPOINTMENT_BOOKED',
        variables: {
          patientName: 'Rahul\nSharma  ',
          clinicName: 'Apollo\r\nClinic\t',
          doctorName: 'Dr.   Aditi   Sharma',
          date: '24 Oct 2026',
          time: '10:30 AM',
          mrn: 'NX-0042',
        },
      });

      expect(msg).toBe(
        'Dear Rahul Sharma, your appointment at Apollo Clinic with Dr. Aditi Sharma is confirmed for 24 Oct 2026 at 10:30 AM. Ref: NX-0042.'
      );
    });
  });

  describe('Strict PHI Minimization & Healthcare Privacy Enforcement', () => {
    it('throws PhiViolationError if prohibited medical keywords are passed', () => {
      expect(() => {
        compileNotificationMessage({
          eventType: 'GENERAL_ANNOUNCEMENT',
          variables: {
            patientName: 'Rahul',
            clinicName: 'Clinic',
            message: 'Your diagnosis of hypertension is confirmed.',
          },
        });
      }).toThrow(PhiViolationError);

      expect(() => {
        compileNotificationMessage({
          eventType: 'GENERAL_ANNOUNCEMENT',
          variables: {
            patientName: 'Rahul',
            clinicName: 'Clinic',
            message: 'Please take 500 mg Paracetamol tablets twice daily.',
          },
        });
      }).toThrow(PhiViolationError);

      expect(() => {
        compileNotificationMessage({
          eventType: 'GENERAL_ANNOUNCEMENT',
          variables: {
            patientName: 'Rahul',
            clinicName: 'Clinic',
            message: 'Your blood pressure systolic reading was high.',
          },
        });
      }).toThrow(PhiViolationError);
    });

    it('assertPhiFree directly catches prohibited terms', () => {
      expect(() => assertPhiFree('Normal administrative reminder')).not.toThrow();
      expect(() => assertPhiFree('Patient has cancer')).toThrow(PhiViolationError);
      expect(() => assertPhiFree('Refill syrup prescription')).toThrow(PhiViolationError);
    });
  });

  describe('SMS Segment Boundaries (GSM-7)', () => {
    it('calculates single-segment SMS correctly (<= 160 chars)', () => {
      const shortText = 'Dear Rahul, appointment confirmed at Apollo Clinic. Ref: NX-001.';
      const res = calculateSmsSegments(shortText);

      expect(res.charCount).toBe(shortText.length);
      expect(res.charCount).toBeLessThanOrEqual(160);
      expect(res.segmentCount).toBe(1);
      expect(res.isSingleSegment).toBe(true);
    });

    it('calculates multi-segment SMS correctly (> 160 chars)', () => {
      const longText = 'A'.repeat(200); // 200 chars -> ceil(200 / 153) = 2 segments
      const res = calculateSmsSegments(longText);

      expect(res.charCount).toBe(200);
      expect(res.segmentCount).toBe(2);
      expect(res.isSingleSegment).toBe(false);

      const threeSegmentText = 'B'.repeat(350); // 350 chars -> ceil(350 / 153) = 3 segments
      const res3 = calculateSmsSegments(threeSegmentText);
      expect(res3.segmentCount).toBe(3);
    });
  });
});
