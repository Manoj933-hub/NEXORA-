import type { NormalizedPhoneResult } from './types';

/**
 * Normalizes and validates phone numbers for India (+91) and Nepal (+977).
 *
 * Rules:
 * - Strips all non-digit characters except a leading '+'.
 * - India (IN): 10 digits starting with 6, 7, 8, or 9.
 *   Accepts: "+91XXXXXXXXXX", "91XXXXXXXXXX", "0XXXXXXXXXX", "XXXXXXXXXX"
 *   Returns: "+91XXXXXXXXXX"
 * - Nepal (NP): 10 digits starting with 97 or 98 (mobile carriers NTC, Ncell, Smart Cell).
 *   Accepts: "+977XXXXXXXXXX", "977XXXXXXXXXX", "0XXXXXXXXXX", "XXXXXXXXXX" (when defaultCountry is 'NP')
 *   Returns: "+977XXXXXXXXXX"
 * - Also accepts general valid E.164 numbers (+1XXXXXXXXXX, etc.).
 */
export function normalizePhoneNumber(
  rawPhone: string | null | undefined,
  defaultCountry: 'IN' | 'NP' = 'IN'
): NormalizedPhoneResult {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return {
      isValid: false,
      e164: null,
      countryCode: null,
      nationalNumber: null,
      error: 'Phone number cannot be empty',
    };
  }

  const trimmed = rawPhone.trim();
  const hasLeadingPlus = trimmed.startsWith('+');

  // Strip all non-digit characters except initial '+'
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (!digitsOnly) {
    return {
      isValid: false,
      e164: null,
      countryCode: null,
      nationalNumber: null,
      error: 'Phone number contains no numeric digits',
    };
  }

  // 1. Explicit Nepal (+977 or starts with 977)
  if (
    (hasLeadingPlus && digitsOnly.startsWith('977')) ||
    (digitsOnly.length === 13 && digitsOnly.startsWith('977'))
  ) {
    const national = digitsOnly.slice(3);
    if (isValidNepaliMobile(national)) {
      return {
        isValid: true,
        e164: `+977${national}`,
        countryCode: 'NP',
        nationalNumber: national,
      };
    }
    return {
      isValid: false,
      e164: null,
      countryCode: 'NP',
      nationalNumber: national,
      error: 'Invalid Nepal mobile number. Must be 10 digits starting with 97 or 98.',
    };
  }

  // 2. Explicit India (+91 or starts with 91)
  if (
    (hasLeadingPlus && digitsOnly.startsWith('91')) ||
    (digitsOnly.length === 12 && digitsOnly.startsWith('91'))
  ) {
    const national = digitsOnly.slice(2);
    if (isValidIndianMobile(national)) {
      return {
        isValid: true,
        e164: `+91${national}`,
        countryCode: 'IN',
        nationalNumber: national,
      };
    }
    return {
      isValid: false,
      e164: null,
      countryCode: 'IN',
      nationalNumber: national,
      error: 'Invalid India mobile number. Must be 10 digits starting with 6, 7, 8, or 9.',
    };
  }

  // 3. National number with leading 0 (e.g. 09876543210)
  let nationalCandidate = digitsOnly;
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    nationalCandidate = digitsOnly.slice(1);
  }

  // 4. Default country context resolution
  if (nationalCandidate.length === 10) {
    if (defaultCountry === 'NP') {
      if (isValidNepaliMobile(nationalCandidate)) {
        return {
          isValid: true,
          e164: `+977${nationalCandidate}`,
          countryCode: 'NP',
          nationalNumber: nationalCandidate,
        };
      }
      // If defaultCountry is NP but number starts with Indian prefix (6,7,8,9), check if Indian
      if (isValidIndianMobile(nationalCandidate)) {
        return {
          isValid: true,
          e164: `+91${nationalCandidate}`,
          countryCode: 'IN',
          nationalNumber: nationalCandidate,
        };
      }
    } else {
      // defaultCountry is 'IN'
      if (isValidIndianMobile(nationalCandidate)) {
        return {
          isValid: true,
          e164: `+91${nationalCandidate}`,
          countryCode: 'IN',
          nationalNumber: nationalCandidate,
        };
      }
      // Check if matches Nepali mobile
      if (isValidNepaliMobile(nationalCandidate)) {
        return {
          isValid: true,
          e164: `+977${nationalCandidate}`,
          countryCode: 'NP',
          nationalNumber: nationalCandidate,
        };
      }
    }

    return {
      isValid: false,
      e164: null,
      countryCode: null,
      nationalNumber: nationalCandidate,
      error: 'Invalid 10-digit mobile number for India/Nepal.',
    };
  }

  // 5. Generic international E.164 check (must have '+' and 8-15 digits total)
  if (hasLeadingPlus && digitsOnly.length >= 8 && digitsOnly.length <= 15) {
    return {
      isValid: true,
      e164: `+${digitsOnly}`,
      countryCode: 'OTHER',
      nationalNumber: digitsOnly,
    };
  }

  return {
    isValid: false,
    e164: null,
    countryCode: null,
    nationalNumber: digitsOnly,
    error: 'Invalid phone number format. Must be an Indian/Nepali mobile number or valid E.164.',
  };
}

/**
 * Checks whether a 10-digit string is a valid Indian mobile number (starts with 6, 7, 8, 9).
 */
export function isValidIndianMobile(nationalNumber: string): boolean {
  return /^[6-9]\d{9}$/.test(nationalNumber);
}

/**
 * Checks whether a 10-digit string is a valid Nepali mobile number (starts with 97 or 98).
 */
export function isValidNepaliMobile(nationalNumber: string): boolean {
  return /^9[78]\d{8}$/.test(nationalNumber);
}

/**
 * Quick boolean check if phone is valid.
 */
export function isValidMobilePhone(
  rawPhone: string | null | undefined,
  defaultCountry: 'IN' | 'NP' = 'IN'
): boolean {
  return normalizePhoneNumber(rawPhone, defaultCountry).isValid;
}

/**
 * Masks a phone number for privacy display in logs, UI, and audit trails.
 * Example: "+919876543210" -> "+91 98****3210"
 */
export function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return 'N/A';
  const trimmed = phone.trim();
  if (trimmed.length < 8) return '***';

  // Keep first 5 characters (e.g. "+9198" or "+9779"), mask middle, keep last 4 digits
  const prefixLength = trimmed.startsWith('+977') ? 6 : 5;
  const start = trimmed.slice(0, prefixLength);
  const end = trimmed.slice(-4);
  return `${start}****${end}`;
}

