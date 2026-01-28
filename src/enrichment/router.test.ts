/**
 * Router Classification Tests
 *
 * Proves that the isFullName guard correctly routes:
 * - Full names → FIND_PERSON / SEARCH_PERSON
 * - Partial names → FIND_COMPANY_CONTACT / SEARCH_COMPANY
 * - No regression on existing behavior
 */

import { describe, it, expect } from 'vitest';
import { classifyInputs, EnrichmentInputs, EnrichmentAction } from './router';

describe('classifyInputs', () => {
  describe('VERIFY action', () => {
    it('routes to VERIFY when email exists', () => {
      expect(classifyInputs({ email: 'test@example.com' })).toBe('VERIFY');
    });

    it('routes to VERIFY even if other fields exist', () => {
      expect(classifyInputs({
        email: 'test@example.com',
        domain: 'example.com',
        person_name: 'John Smith',
      })).toBe('VERIFY');
    });
  });

  describe('FIND_PERSON action (full name required)', () => {
    it('routes to FIND_PERSON with domain + full name (2 words)', () => {
      expect(classifyInputs({
        domain: 'example.com',
        person_name: 'John Smith',
      })).toBe('FIND_PERSON');
    });

    it('routes to FIND_PERSON with domain + full name (3+ words)', () => {
      expect(classifyInputs({
        domain: 'example.com',
        person_name: 'Mary Jane Watson',
      })).toBe('FIND_PERSON');
    });

    it('routes to FIND_PERSON with extra whitespace in name', () => {
      expect(classifyInputs({
        domain: 'example.com',
        person_name: '  John   Smith  ',
      })).toBe('FIND_PERSON');
    });
  });

  describe('FIND_COMPANY_CONTACT action (partial name fallback)', () => {
    it('routes to FIND_COMPANY_CONTACT with domain only', () => {
      expect(classifyInputs({
        domain: 'example.com',
      })).toBe('FIND_COMPANY_CONTACT');
    });

    it('routes to FIND_COMPANY_CONTACT with domain + single word name', () => {
      // This is the bug fix - "Ivelisse" should NOT go to FIND_PERSON
      expect(classifyInputs({
        domain: 'avantecap.com',
        person_name: 'Ivelisse',
      })).toBe('FIND_COMPANY_CONTACT');
    });

    it('routes to FIND_COMPANY_CONTACT with domain + empty name', () => {
      expect(classifyInputs({
        domain: 'example.com',
        person_name: '',
      })).toBe('FIND_COMPANY_CONTACT');
    });

    it('routes to FIND_COMPANY_CONTACT with domain + whitespace-only name', () => {
      expect(classifyInputs({
        domain: 'example.com',
        person_name: '   ',
      })).toBe('FIND_COMPANY_CONTACT');
    });

    it('routes to FIND_COMPANY_CONTACT with domain + null name', () => {
      expect(classifyInputs({
        domain: 'example.com',
        person_name: null,
      })).toBe('FIND_COMPANY_CONTACT');
    });
  });

  describe('SEARCH_PERSON action (full name required)', () => {
    it('routes to SEARCH_PERSON with company + full name', () => {
      expect(classifyInputs({
        company: 'Acme Corp',
        person_name: 'John Smith',
      })).toBe('SEARCH_PERSON');
    });
  });

  describe('SEARCH_COMPANY action (partial name fallback)', () => {
    it('routes to SEARCH_COMPANY with company only', () => {
      expect(classifyInputs({
        company: 'Acme Corp',
      })).toBe('SEARCH_COMPANY');
    });

    it('routes to SEARCH_COMPANY with company + single word name', () => {
      expect(classifyInputs({
        company: 'Acme Corp',
        person_name: 'John',
      })).toBe('SEARCH_COMPANY');
    });
  });

  describe('CANNOT_ROUTE action', () => {
    it('routes to CANNOT_ROUTE with no usable inputs', () => {
      expect(classifyInputs({})).toBe('CANNOT_ROUTE');
    });

    it('routes to CANNOT_ROUTE with only person_name', () => {
      expect(classifyInputs({
        person_name: 'John Smith',
      })).toBe('CANNOT_ROUTE');
    });
  });

  describe('Regression: Real-world cases', () => {
    it('handles the Ivelisse case (bug report)', () => {
      // Before fix: FIND_PERSON → 400 error from Anymail
      // After fix: FIND_COMPANY_CONTACT → finds decision maker
      expect(classifyInputs({
        domain: 'avantecap.com',
        person_name: 'Ivelisse',
      })).toBe('FIND_COMPANY_CONTACT');
    });

    it('handles normal full name case (no regression)', () => {
      expect(classifyInputs({
        domain: 'stripe.com',
        person_name: 'Patrick Collison',
      })).toBe('FIND_PERSON');
    });

    it('handles hyphenated names as full names', () => {
      expect(classifyInputs({
        domain: 'example.com',
        person_name: 'Mary-Jane Watson',
      })).toBe('FIND_PERSON');
    });
  });
});
