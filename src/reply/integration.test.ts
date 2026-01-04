/**
 * Reply Brain v17 - Integration Tests
 *
 * These tests hit the actual edge function handler path.
 * Run against local supabase or deployed edge function.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const EDGE_URL = process.env.REPLY_BRAIN_URL || 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/reply-brain';

interface ReplyBrainResponse {
  classification: string;
  stage: string;
  reply: string;
  meaning: string;
  response: string;
  next_move: string;
  anchor: {
    prospect_label: string;
    pain_sentence: string;
    offer_sentence: string;
    outbound_summary: string;
    quality: string;
    missing: string[];
  };
  telemetry: {
    version: string;
    runtimeMode: string;
    stagePrimary: string;
    stageSecondary: string[];
    negationDetected: boolean;
    anchorQuality: string;
    usedMicroRewrite: boolean;
    microRewriteAccepted: boolean;
    embarrassmentGateHit: boolean;
    unknownTriggers: string[];
    forbidTriggered: string[];
    latencyMs: number;
  };
  error?: string;
}

async function callReplyBrain(payload: object): Promise<ReplyBrainResponse> {
  const response = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return response.json();
}

describe('Reply Brain v17 - Integration Tests', () => {
  describe('Handler Path', () => {
    it('should return 200 with empty input (never 400)', async () => {
      const result = await callReplyBrain({});
      expect(result.stage).toBe('UNKNOWN');
      expect(result.reply).toBeDefined();
      expect(result.telemetry?.version).toBe('v17');
    });

    it('should return 200 with null pastedReply', async () => {
      const result = await callReplyBrain({ pastedReply: null });
      expect(result.stage).toBe('UNKNOWN');
      expect(result.reply).toBeDefined();
    });

    it('should return 200 with empty string pastedReply', async () => {
      const result = await callReplyBrain({ pastedReply: '' });
      expect(result.stage).toBe('UNKNOWN');
      expect(result.reply).toBeDefined();
    });
  });

  describe('Golden Path - Interest', () => {
    it('should classify "interested" as INTEREST', async () => {
      const result = await callReplyBrain({
        pastedReply: 'interested, tell me more',
        initialMessage: 'Noticed Acme helps founders. Worth an intro?',
      });
      expect(result.stage).toBe('INTEREST');
      expect(result.reply).toBeDefined();
      expect(result.reply.length).toBeGreaterThan(0);
    });

    it('should classify "yes sounds good" as INTEREST', async () => {
      const result = await callReplyBrain({
        pastedReply: 'yes sounds good',
        initialMessage: 'I know a few CFOs who need help.',
      });
      expect(result.stage).toBe('INTEREST');
    });

    it('should classify "sure, happy to chat" as INTEREST', async () => {
      const result = await callReplyBrain({
        pastedReply: 'sure, happy to chat',
      });
      expect(result.stage).toBe('INTEREST');
    });
  });

  describe('Golden Path - Identity', () => {
    it('should classify "how does this work?" as IDENTITY', async () => {
      const result = await callReplyBrain({
        pastedReply: 'how does this work?',
      });
      expect(result.stage).toBe('IDENTITY');
    });

    it('should classify "what\'s the process?" as IDENTITY', async () => {
      const result = await callReplyBrain({
        pastedReply: "what's the process?",
      });
      expect(result.stage).toBe('IDENTITY');
    });
  });

  describe('Golden Path - Pricing', () => {
    it('should classify "what\'s in it for you?" as PRICING', async () => {
      const result = await callReplyBrain({
        pastedReply: "what's in it for you?",
      });
      expect(result.stage).toBe('PRICING');
    });

    it('should classify "how do you get paid?" as PRICING', async () => {
      const result = await callReplyBrain({
        pastedReply: 'how do you get paid?',
      });
      expect(result.stage).toBe('PRICING');
    });
  });

  describe('Golden Path - Proof', () => {
    it('should classify "who are these people?" as PROOF', async () => {
      const result = await callReplyBrain({
        pastedReply: 'who are these people?',
      });
      expect(result.stage).toBe('PROOF');
    });

    it('should classify "can you give me names?" as PROOF', async () => {
      const result = await callReplyBrain({
        pastedReply: 'can you give me names?',
      });
      expect(result.stage).toBe('PROOF');
    });
  });

  describe('Golden Path - Scheduling', () => {
    it('should classify "what times work?" as SCHEDULING', async () => {
      const result = await callReplyBrain({
        pastedReply: 'what times work?',
      });
      expect(result.stage).toBe('SCHEDULING');
    });

    it('should classify "send me your calendar" as SCHEDULING', async () => {
      const result = await callReplyBrain({
        pastedReply: 'send me your calendar',
      });
      expect(result.stage).toBe('SCHEDULING');
    });
  });

  describe('Golden Path - Negative/Hostile', () => {
    it('should classify "not interested" as NEGATIVE', async () => {
      const result = await callReplyBrain({
        pastedReply: 'not interested',
      });
      expect(result.stage).toBe('NEGATIVE');
    });

    it('should classify "this is spam" as HOSTILE', async () => {
      const result = await callReplyBrain({
        pastedReply: 'this is spam',
      });
      expect(result.stage).toBe('HOSTILE');
    });

    it('should NOT include CTA in NEGATIVE reply', async () => {
      const result = await callReplyBrain({
        pastedReply: 'not interested',
      });
      expect(result.stage).toBe('NEGATIVE');
      expect(result.reply.toLowerCase()).not.toContain('week');
      expect(result.reply.toLowerCase()).not.toContain('call');
      expect(result.reply.toLowerCase()).not.toContain('calendar');
    });

    it('should NOT include CTA in HOSTILE reply', async () => {
      const result = await callReplyBrain({
        pastedReply: 'this is spam, reported',
      });
      expect(result.stage).toBe('HOSTILE');
      expect(result.reply.toLowerCase()).not.toContain('week');
      expect(result.reply.toLowerCase()).not.toContain('call');
    });
  });

  describe('Golden Path - OOO/Bounce', () => {
    it('should classify OOO message', async () => {
      const result = await callReplyBrain({
        pastedReply: "I'm out of office until January 5th",
      });
      expect(result.stage).toBe('OOO');
    });

    it('should classify bounce message', async () => {
      const result = await callReplyBrain({
        pastedReply: 'address not found - mailbox does not exist',
      });
      expect(result.stage).toBe('BOUNCE');
    });
  });

  describe('Guest Mode', () => {
    it('should work without userId (guest mode)', async () => {
      const result = await callReplyBrain({
        pastedReply: 'interested',
        runtimeMode: 'guest',
      });
      expect(result.stage).toBe('INTEREST');
      expect(result.telemetry?.runtimeMode).toBe('guest');
    });

    it('should work without aiConfig', async () => {
      const result = await callReplyBrain({
        pastedReply: 'how does this work?',
      });
      expect(result.stage).toBe('IDENTITY');
      expect(result.telemetry?.usedMicroRewrite).toBe(false);
    });
  });

  describe('Response Schema', () => {
    it('should include all legacy fields', async () => {
      const result = await callReplyBrain({
        pastedReply: 'interested',
      });
      expect(result).toHaveProperty('meaning');
      expect(result).toHaveProperty('response');
      expect(result).toHaveProperty('next_move');
      expect(result).toHaveProperty('classification');
      expect(result).toHaveProperty('stage');
      expect(result).toHaveProperty('reply');
    });

    it('should include telemetry', async () => {
      const result = await callReplyBrain({
        pastedReply: 'interested',
      });
      expect(result.telemetry).toBeDefined();
      expect(result.telemetry.version).toBe('v17');
      expect(result.telemetry.stagePrimary).toBeDefined();
      expect(result.telemetry.latencyMs).toBeDefined();
    });

    it('should include anchor', async () => {
      const result = await callReplyBrain({
        pastedReply: 'interested',
        initialMessage: 'Noticed Acme helps founders at PE-backed companies.',
      });
      expect(result.anchor).toBeDefined();
      expect(result.anchor.quality).toBeDefined();
      expect(result.anchor.prospect_label).toBeDefined();
    });
  });

  describe('Contradiction Guard (v17)', () => {
    it('should classify "ok but I\'m not ok with this" as NEGATIVE', async () => {
      const result = await callReplyBrain({
        pastedReply: "ok but I'm not ok with this",
      });
      expect(result.stage).toBe('NEGATIVE');
    });

    it('should classify "sounds good but not interested" as NEGATIVE', async () => {
      const result = await callReplyBrain({
        pastedReply: 'sounds good but not interested',
      });
      expect(result.stage).toBe('NEGATIVE');
    });
  });

  describe('Compound Questions (v17)', () => {
    it('should route "what\'s in it for you" to PRICING + IDENTITY', async () => {
      const result = await callReplyBrain({
        pastedReply: "what's in it for you?",
      });
      expect(result.stage).toBe('PRICING');
      // Secondary may include IDENTITY
    });
  });

  describe('Call-First Policy', () => {
    it('INTEREST reply should mention call/fit check', async () => {
      const result = await callReplyBrain({
        pastedReply: 'interested, tell me more',
        initialMessage: 'Noticed Acme helps founders. Worth an intro?',
      });
      expect(result.stage).toBe('INTEREST');
      const reply = result.reply.toLowerCase();
      expect(
        reply.includes('call') ||
        reply.includes('fit') ||
        reply.includes('10') ||
        reply.includes('week')
      ).toBe(true);
    });
  });

  describe('Banned Phrases', () => {
    it('should never output "are lose" pattern', async () => {
      const result = await callReplyBrain({
        pastedReply: 'interested',
        initialMessage: 'I know companies who lose money on taxes.',
      });
      expect(result.reply).not.toMatch(/are lose/i);
    });

    it('should never output embarrassing fragments', async () => {
      const result = await callReplyBrain({
        pastedReply: 'sounds good',
        initialMessage: 'Noticed Acme helps founders.',
      });
      expect(result.reply).not.toMatch(/the people i mentioned are \w+ing/i);
    });
  });
});
