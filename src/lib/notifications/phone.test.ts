import { describe, it, expect } from 'vitest';
import {
  normalizePhoneNumber,
  isValidIndianMobile,
  isValidNepaliMobile,
  isValidMobilePhone,
  maskPhoneNumber,
} from './phone';

describe('Phone Number Normalization & Validation Suite', () => {
  describe('Indian Phone Numbers (+91)', () => {
    it('normalizes standard 10-digit Indian mobile number', () => {
      const result = normalizePhoneNumber('9876543210', 'IN');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+919876543210');
      expect(result.countryCode).toBe('IN');
      expect(result.nationalNumber).toBe('9876543210');
    });

    it('normalizes Indian number with leading +91', () => {
      const result = normalizePhoneNumber('+91 98765 43210');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+919876543210');
      expect(result.countryCode).toBe('IN');
    });

    it('normalizes Indian number with leading 91 without plus', () => {
      const result = normalizePhoneNumber('919876543210');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+919876543210');
      expect(result.countryCode).toBe('IN');
    });

    it('normalizes Indian number with leading 0 (trunk code)', () => {
      const result = normalizePhoneNumber('09876543210', 'IN');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+919876543210');
      expect(result.countryCode).toBe('IN');
    });

    it('handles formatted numbers with dashes, spaces, and parentheses', () => {
      const result = normalizePhoneNumber('+91 (9876) 54-3210');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+919876543210');
    });

    it('validates mobile prefixes 6, 7, 8, 9', () => {
      expect(isValidIndianMobile('6123456789')).toBe(true);
      expect(isValidIndianMobile('7123456789')).toBe(true);
      expect(isValidIndianMobile('8123456789')).toBe(true);
      expect(isValidIndianMobile('9123456789')).toBe(true);
    });

    it('rejects Indian numbers starting with invalid prefixes (e.g. 0-5 landlines)', () => {
      expect(isValidIndianMobile('1234567890')).toBe(false);
      expect(isValidIndianMobile('5234567890')).toBe(false);
      const result = normalizePhoneNumber('1234567890', 'IN');
      expect(result.isValid).toBe(false);
    });
  });

  describe('Nepali Phone Numbers (+977)', () => {
    it('normalizes standard 10-digit Nepali mobile number starting with 98', () => {
      const result = normalizePhoneNumber('9841234567', 'NP');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+9779841234567');
      expect(result.countryCode).toBe('NP');
      expect(result.nationalNumber).toBe('9841234567');
    });

    it('normalizes 10-digit Nepali mobile number starting with 97 (Smart/NTC)', () => {
      const result = normalizePhoneNumber('9741234567', 'NP');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+9779741234567');
      expect(result.countryCode).toBe('NP');
    });

    it('normalizes Nepali number with leading +977', () => {
      const result = normalizePhoneNumber('+977 9841 234567');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+9779841234567');
      expect(result.countryCode).toBe('NP');
    });

    it('normalizes Nepali number with leading 977 without plus', () => {
      const result = normalizePhoneNumber('9779841234567');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+9779841234567');
      expect(result.countryCode).toBe('NP');
    });

    it('validates Nepali mobile prefixes 98 and 97', () => {
      expect(isValidNepaliMobile('9851012345')).toBe(true);
      expect(isValidNepaliMobile('9751012345')).toBe(true);
      expect(isValidNepaliMobile('9651012345')).toBe(false); // 96 is not a standard mobile prefix
      expect(isValidNepaliMobile('0142345678')).toBe(false); // Kathmandu landline
    });
  });

  describe('International and Invalid Inputs', () => {
    it('accepts generic valid E.164 numbers from other countries', () => {
      const result = normalizePhoneNumber('+14155552671');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+14155552671');
      expect(result.countryCode).toBe('OTHER');
    });

    it('rejects empty, null, or undefined strings', () => {
      expect(normalizePhoneNumber('').isValid).toBe(false);
      expect(normalizePhoneNumber(null).isValid).toBe(false);
      expect(normalizePhoneNumber(undefined).isValid).toBe(false);
      expect(normalizePhoneNumber('   ').isValid).toBe(false);
    });

    it('rejects numbers that are too short or too long', () => {
      expect(normalizePhoneNumber('12345').isValid).toBe(false);
      expect(normalizePhoneNumber('98765432101234567').isValid).toBe(false);
    });

    it('rejects strings with no digits', () => {
      expect(normalizePhoneNumber('abcdefghij').isValid).toBe(false);
    });

    it('boolean helper isValidMobilePhone works correctly', () => {
      expect(isValidMobilePhone('9876543210', 'IN')).toBe(true);
      expect(isValidMobilePhone('9841234567', 'NP')).toBe(true);
      expect(isValidMobilePhone('invalid')).toBe(false);
    });
  });

  describe('Phone Number Masking for Privacy', () => {
    it('masks phone numbers safely', () => {
      expect(maskPhoneNumber('+919876543210')).toBe('+9198****3210');
      expect(maskPhoneNumber('+9779841234567')).toBe('+97798****4567');
    });

    it('handles short or empty phone numbers gracefully', () => {
      expect(maskPhoneNumber('')).toBe('N/A');
      expect(maskPhoneNumber(null)).toBe('N/A');
      expect(maskPhoneNumber('123')).toBe('***');
    });
  });
});
