/**
 * DNS Intelligence Tests
 *
 * All DNS calls mocked — no real network.
 * Tests provider mapping, SPF inference, autodiscover, liveness.
 */

// Mock dns.promises before requiring the module
const mockResolve4 = jest.fn();
const mockResolve6 = jest.fn();
const mockResolveMx = jest.fn();
const mockResolveTxt = jest.fn();
const mockResolveCname = jest.fn();

jest.mock('dns', () => ({
  promises: {
    resolve4: mockResolve4,
    resolve6: mockResolve6,
    resolveMx: mockResolveMx,
    resolveTxt: mockResolveTxt,
    resolveCname: mockResolveCname,
  },
}));

const {
  isDomainLive,
  getMxProvider,
  inferMailboxProviderFromSpf,
  inferProviderFromAutodiscover,
  clearAllCaches,
  LruTtlCache,
} = require('../dnsIntel');

// Clear caches between tests
beforeEach(() => {
  clearAllCaches();
  jest.clearAllMocks();
});

// ============================================================
// LRU CACHE
// ============================================================

describe('LruTtlCache', () => {
  test('stores and retrieves values', () => {
    const cache = new LruTtlCache(10);
    cache.set('key1', 'value1', 60000);
    expect(cache.get('key1')).toBe('value1');
  });

  test('returns null for expired entries', () => {
    const cache = new LruTtlCache(10);
    cache.set('key1', 'value1', 1); // 1ms TTL
    // Wait for expiration
    const start = Date.now();
    while (Date.now() - start < 5) {} // spin wait
    expect(cache.get('key1')).toBeNull();
  });

  test('evicts oldest entry when at capacity', () => {
    const cache = new LruTtlCache(2);
    cache.set('a', 1, 60000);
    cache.set('b', 2, 60000);
    cache.set('c', 3, 60000); // Should evict 'a'
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  test('clears all entries', () => {
    const cache = new LruTtlCache(10);
    cache.set('a', 1, 60000);
    cache.set('b', 2, 60000);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

// ============================================================
// DOMAIN LIVENESS
// ============================================================

describe('isDomainLive', () => {
  test('live domain (A record resolves)', async () => {
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    mockResolve6.mockRejectedValue(new Error('ENODATA'));

    const result = await isDomainLive('stripe.com', 'test');
    expect(result.live).toBe(true);
    expect(result.ms).toBeDefined();
  });

  test('live domain (AAAA record resolves)', async () => {
    mockResolve4.mockRejectedValue(new Error('ENODATA'));
    mockResolve6.mockResolvedValue(['::1']);

    const result = await isDomainLive('stripe.com', 'test');
    expect(result.live).toBe(true);
  });

  test('dead domain (NXDOMAIN)', async () => {
    const err = new Error('ENOTFOUND');
    err.code = 'ENOTFOUND';
    // Promise.any rejects with AggregateError containing both errors
    mockResolve4.mockRejectedValue(err);
    mockResolve6.mockRejectedValue(err);

    const result = await isDomainLive('dead-domain-xyz.com', 'test');
    expect(result.live).toBe(false);
    expect(result.reason).toBe('NXDOMAIN');
  });

  test('timeout returns unknown (no short-circuit)', async () => {
    // Simulate timeout by never resolving
    mockResolve4.mockImplementation(() => new Promise(() => {}));
    mockResolve6.mockImplementation(() => new Promise(() => {}));

    const result = await isDomainLive('slow-domain.com', 'test');
    expect(result.live).toBe('unknown');
    expect(result.reason).toBe('TIMEOUT');
  }, 5000);

  test('caches results', async () => {
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    mockResolve6.mockRejectedValue(new Error('ENODATA'));

    await isDomainLive('cached.com', 'test');
    await isDomainLive('cached.com', 'test');

    // DNS should only be called once (second call hits cache)
    expect(mockResolve4).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// MX PROVIDER
// ============================================================

describe('getMxProvider', () => {
  test('detects Google Workspace', async () => {
    mockResolveMx.mockResolvedValue([
      { exchange: 'aspmx.l.google.com', priority: 1 },
      { exchange: 'alt1.aspmx.l.google.com', priority: 5 },
    ]);

    const result = await getMxProvider('stripe.com', 'test');
    expect(result.provider).toBe('google');
    expect(result.smtpBlocking).toBe(true);
    expect(result.isGateway).toBe(false);
  });

  test('detects Microsoft 365', async () => {
    mockResolveMx.mockResolvedValue([
      { exchange: 'stripe-com.mail.protection.outlook.com', priority: 0 },
    ]);

    const result = await getMxProvider('example.com', 'test');
    expect(result.provider).toBe('microsoft');
    expect(result.smtpBlocking).toBe(false);
  });

  test('detects Mimecast as gateway', async () => {
    mockResolveMx.mockResolvedValue([
      { exchange: 'us-smtp-inbound-1.mimecast.com', priority: 10 },
    ]);

    const result = await getMxProvider('example.com', 'test');
    expect(result.provider).toBe('mimecast');
    expect(result.smtpBlocking).toBe(true);
    expect(result.isGateway).toBe(true);
  });

  test('detects Proofpoint as gateway', async () => {
    mockResolveMx.mockResolvedValue([
      { exchange: 'mx1-us1.pphosted.com', priority: 10 },
    ]);

    const result = await getMxProvider('bigcorp.com', 'test');
    expect(result.provider).toBe('proofpoint');
    expect(result.isGateway).toBe(true);
  });

  test('detects Barracuda as gateway', async () => {
    mockResolveMx.mockResolvedValue([
      { exchange: 'mx1.barracudanetworks.com', priority: 10 },
    ]);

    const result = await getMxProvider('example.com', 'test');
    expect(result.provider).toBe('barracuda');
    expect(result.isGateway).toBe(true);
  });

  test('detects ProtonMail', async () => {
    mockResolveMx.mockResolvedValue([
      { exchange: 'mail.protonmail.ch', priority: 5 },
    ]);

    const result = await getMxProvider('pm-user.com', 'test');
    expect(result.provider).toBe('proton');
    expect(result.smtpBlocking).toBe(true);
  });

  test('detects Zoho', async () => {
    mockResolveMx.mockResolvedValue([
      { exchange: 'mx.zoho.com', priority: 10 },
    ]);

    const result = await getMxProvider('zoho-user.com', 'test');
    expect(result.provider).toBe('zoho');
    expect(result.smtpBlocking).toBe(false);
  });

  test('returns unknown for unrecognized MX', async () => {
    mockResolveMx.mockResolvedValue([
      { exchange: 'mail.custom-host.net', priority: 10 },
    ]);

    const result = await getMxProvider('custom.com', 'test');
    expect(result.provider).toBe('unknown');
    expect(result.smtpBlocking).toBe(false);
  });

  test('returns unknown on DNS error', async () => {
    mockResolveMx.mockRejectedValue(new Error('SERVFAIL'));

    const result = await getMxProvider('broken.com', 'test');
    expect(result.provider).toBe('unknown');
    expect(result.error).toBeDefined();
  });
});

// ============================================================
// SPF INFERENCE
// ============================================================

describe('inferMailboxProviderFromSpf', () => {
  test('infers Google from SPF', async () => {
    mockResolveTxt.mockResolvedValue([
      ['v=spf1 include:_spf.google.com ~all'],
    ]);

    const result = await inferMailboxProviderFromSpf('company.com', 'test');
    expect(result.inferred).toBe('google');
    expect(result.spfPresent).toBe(true);
  });

  test('infers Microsoft from SPF', async () => {
    mockResolveTxt.mockResolvedValue([
      ['v=spf1 include:spf.protection.outlook.com -all'],
    ]);

    const result = await inferMailboxProviderFromSpf('company.com', 'test');
    expect(result.inferred).toBe('microsoft');
    expect(result.spfPresent).toBe(true);
  });

  test('infers Zoho from SPF', async () => {
    mockResolveTxt.mockResolvedValue([
      ['v=spf1 include:zoho.com ~all'],
    ]);

    const result = await inferMailboxProviderFromSpf('company.com', 'test');
    expect(result.inferred).toBe('zoho');
  });

  test('returns unknown when no SPF record', async () => {
    mockResolveTxt.mockResolvedValue([
      ['google-site-verification=abc123'],
    ]);

    const result = await inferMailboxProviderFromSpf('company.com', 'test');
    expect(result.inferred).toBe('unknown');
    expect(result.spfPresent).toBe(false);
  });

  test('returns unknown for unrecognized SPF includes', async () => {
    mockResolveTxt.mockResolvedValue([
      ['v=spf1 include:custom-mail.net ~all'],
    ]);

    const result = await inferMailboxProviderFromSpf('company.com', 'test');
    expect(result.inferred).toBe('unknown');
    expect(result.spfPresent).toBe(true);
  });

  test('handles multi-chunk TXT records', async () => {
    // TXT records can be split into chunks
    mockResolveTxt.mockResolvedValue([
      ['v=spf1 include:', '_spf.google.com ~all'],
    ]);

    const result = await inferMailboxProviderFromSpf('company.com', 'test');
    expect(result.inferred).toBe('google');
  });
});

// ============================================================
// AUTODISCOVER
// ============================================================

describe('inferProviderFromAutodiscover', () => {
  test('detects Microsoft 365 via autodiscover CNAME', async () => {
    mockResolveCname.mockResolvedValue(['autodiscover.outlook.com']);

    const result = await inferProviderFromAutodiscover('company.com', 'test');
    expect(result.inferred).toBe('microsoft');
    expect(result.hit).toBe(true);
  });

  test('returns unknown for non-Microsoft autodiscover', async () => {
    mockResolveCname.mockResolvedValue(['mail.custom.com']);

    const result = await inferProviderFromAutodiscover('company.com', 'test');
    expect(result.inferred).toBe('unknown');
    expect(result.hit).toBe(true);
  });

  test('returns unknown when no CNAME exists', async () => {
    const err = new Error('ENOTFOUND');
    err.code = 'ENOTFOUND';
    mockResolveCname.mockRejectedValue(err);

    const result = await inferProviderFromAutodiscover('company.com', 'test');
    expect(result.inferred).toBe('unknown');
    expect(result.hit).toBe(false);
  });
});
