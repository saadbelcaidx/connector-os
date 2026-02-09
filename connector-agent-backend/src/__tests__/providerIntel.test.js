/**
 * Provider Intelligence Tests
 *
 * Tests combined resolution logic: MX + SPF + Autodiscover → provider.
 */

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

const { resolveMailboxProvider } = require('../providerIntel');
const { clearAllCaches } = require('../dnsIntel');

beforeEach(() => {
  clearAllCaches();
  jest.clearAllMocks();
});

describe('resolveMailboxProvider', () => {
  test('MX=mimecast + SPF=google → provider=google (gateway detected)', async () => {
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    mockResolve6.mockRejectedValue(new Error('ENODATA'));
    mockResolveMx.mockResolvedValue([
      { exchange: 'us-smtp-inbound-1.mimecast.com', priority: 10 },
    ]);
    mockResolveTxt.mockResolvedValue([
      ['v=spf1 include:_spf.google.com ~all'],
    ]);
    mockResolveCname.mockRejectedValue({ code: 'ENOTFOUND' });

    const result = await resolveMailboxProvider('company.com', 'test');
    expect(result.provider).toBe('google');
    expect(result.gatewayMx).toBe('mimecast');
    expect(result.smtpBlocking).toBe(true);
    expect(result.evidence.mx).toBe('mimecast');
    expect(result.evidence.spf).toBe('google');
    expect(result.live).toBe(true);
  });

  test('MX=proofpoint + autodiscover=outlook → provider=microsoft', async () => {
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    mockResolve6.mockRejectedValue(new Error('ENODATA'));
    mockResolveMx.mockResolvedValue([
      { exchange: 'mx1-us1.pphosted.com', priority: 10 },
    ]);
    mockResolveTxt.mockResolvedValue([
      ['v=spf1 include:spf.protection.outlook.com -all'],
    ]);
    mockResolveCname.mockResolvedValue(['autodiscover.outlook.com']);

    const result = await resolveMailboxProvider('bigcorp.com', 'test');
    // Autodiscover has highest priority
    expect(result.provider).toBe('microsoft');
    expect(result.gatewayMx).toBe('proofpoint');
    expect(result.smtpBlocking).toBe(false); // Microsoft doesn't block SMTP
  });

  test('direct Google MX → provider=google', async () => {
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    mockResolve6.mockRejectedValue(new Error('ENODATA'));
    mockResolveMx.mockResolvedValue([
      { exchange: 'aspmx.l.google.com', priority: 1 },
    ]);
    mockResolveTxt.mockResolvedValue([
      ['v=spf1 include:_spf.google.com ~all'],
    ]);
    mockResolveCname.mockRejectedValue({ code: 'ENOTFOUND' });

    const result = await resolveMailboxProvider('startup.com', 'test');
    expect(result.provider).toBe('google');
    expect(result.gatewayMx).toBeNull();
    expect(result.smtpBlocking).toBe(true);
  });

  test('dead domain returns live=false', async () => {
    const nxErr = new Error('ENOTFOUND');
    nxErr.code = 'ENOTFOUND';
    mockResolve4.mockRejectedValue(nxErr);
    mockResolve6.mockRejectedValue(nxErr);
    mockResolveMx.mockRejectedValue(nxErr);
    mockResolveTxt.mockRejectedValue(nxErr);
    mockResolveCname.mockRejectedValue(nxErr);

    const result = await resolveMailboxProvider('dead-domain.com', 'test');
    expect(result.live).toBe(false);
    expect(result.provider).toBe('unknown');
  });

  test('unknown provider when nothing matches', async () => {
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    mockResolve6.mockRejectedValue(new Error('ENODATA'));
    mockResolveMx.mockResolvedValue([
      { exchange: 'mail.custom-host.net', priority: 10 },
    ]);
    mockResolveTxt.mockResolvedValue([
      ['v=spf1 include:custom-mail.net ~all'],
    ]);
    mockResolveCname.mockRejectedValue({ code: 'ENOTFOUND' });

    const result = await resolveMailboxProvider('custom.com', 'test');
    expect(result.provider).toBe('unknown');
    expect(result.smtpBlocking).toBe(false);
    expect(result.gatewayMx).toBeNull();
  });
});
