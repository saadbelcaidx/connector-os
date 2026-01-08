/**
 * Web Extraction Module
 * Crawls company websites to extract emails from:
 * - mailto: links
 * - Visible text
 * - HTML attributes
 * - JavaScript strings
 *
 * NO guessing. Only extraction.
 */

const puppeteer = require('puppeteer');

// Email regex - strict, no false positives
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Common contact page paths
const CONTACT_PATHS = ['/', '/contact', '/contact-us', '/about', '/about-us', '/team', '/people', '/leadership', '/our-team'];

// Timeout for page loads (ms)
const PAGE_TIMEOUT = 10000;

// Browser instance (reused)
let browserInstance = null;

/**
 * Get or create browser instance
 */
async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--safebrowsing-disable-auto-update'
      ]
    });
  }
  return browserInstance;
}

/**
 * Extract emails from a single page
 * @param {string} url - Full URL to crawl
 * @returns {string[]} - Array of extracted emails (lowercase, deduped)
 */
async function extractEmailsFromPage(url) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  const emails = new Set();

  try {
    // Set reasonable timeout
    page.setDefaultTimeout(PAGE_TIMEOUT);

    // Block unnecessary resources for speed
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navigate to page
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT
    });

    // Wait a bit for JS to render
    await new Promise(r => setTimeout(r, 1000));

    // Extract from page content
    const pageContent = await page.content();

    // 1. Extract from mailto: links
    const mailtoMatches = pageContent.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi) || [];
    for (const match of mailtoMatches) {
      const email = match.replace(/^mailto:/i, '').toLowerCase().trim();
      if (isValidEmail(email)) {
        emails.add(email);
      }
    }

    // 2. Extract from visible text
    const visibleText = await page.evaluate(() => document.body.innerText);
    const textMatches = visibleText.match(EMAIL_REGEX) || [];
    for (const email of textMatches) {
      const normalized = email.toLowerCase().trim();
      if (isValidEmail(normalized)) {
        emails.add(normalized);
      }
    }

    // 3. Extract from href attributes
    const hrefEmails = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="@"]'));
      return links.map(a => a.href).filter(h => h.includes('@'));
    });
    for (const href of hrefEmails) {
      const match = href.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (match) {
        const email = match[1].toLowerCase().trim();
        if (isValidEmail(email)) {
          emails.add(email);
        }
      }
    }

    // 4. Extract from data attributes and other HTML
    const htmlMatches = pageContent.match(EMAIL_REGEX) || [];
    for (const email of htmlMatches) {
      const normalized = email.toLowerCase().trim();
      if (isValidEmail(normalized)) {
        emails.add(normalized);
      }
    }

  } catch (err) {
    // Silent fail - page might not exist or timeout
    console.log(`[WebExtract] Failed to crawl ${url}: ${err.message}`);
  } finally {
    await page.close();
  }

  return Array.from(emails);
}

/**
 * Validate email format (strict)
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;

  // Must have @ and .
  if (!email.includes('@') || !email.includes('.')) return false;

  // Split into local and domain
  const parts = email.split('@');
  if (parts.length !== 2) return false;

  const [local, domain] = parts;

  // Local part validation
  if (!local || local.length === 0 || local.length > 64) return false;

  // Domain validation
  if (!domain || domain.length < 3) return false;
  if (!domain.includes('.')) return false;

  // Filter out common false positives
  const falsePositives = [
    'example.com',
    'test.com',
    'domain.com',
    'email.com',
    'company.com',
    'yourcompany.com',
    'yourdomain.com',
    'sentry.io',
    'wixpress.com',
    'placeholder'
  ];

  if (falsePositives.some(fp => domain.includes(fp))) return false;

  // Filter out image/file extensions that look like emails
  if (domain.match(/\.(png|jpg|jpeg|gif|svg|css|js|ico)$/i)) return false;

  return true;
}

/**
 * Extract all emails from a company's website
 * @param {string} domain - Company domain (e.g., "company.com")
 * @returns {string[]} - Array of extracted emails, deduped
 */
async function extractEmailsFromDomain(domain) {
  const allEmails = new Set();
  const baseUrl = `https://${domain}`;

  console.log(`[WebExtract] Crawling ${domain}...`);

  for (const path of CONTACT_PATHS) {
    const url = `${baseUrl}${path}`;
    try {
      const emails = await extractEmailsFromPage(url);
      for (const email of emails) {
        // Only keep emails from this domain
        if (email.endsWith(`@${domain}`)) {
          allEmails.add(email);
        }
      }
    } catch (err) {
      // Continue to next path
    }
  }

  // Also try www subdomain if base fails
  if (allEmails.size === 0) {
    const wwwUrl = `https://www.${domain}`;
    for (const path of CONTACT_PATHS.slice(0, 3)) { // Only try first 3 paths for www
      try {
        const emails = await extractEmailsFromPage(`${wwwUrl}${path}`);
        for (const email of emails) {
          if (email.endsWith(`@${domain}`) || email.endsWith(`@www.${domain}`)) {
            allEmails.add(email.replace(`@www.${domain}`, `@${domain}`));
          }
        }
      } catch (err) {
        // Continue
      }
    }
  }

  const results = Array.from(allEmails);
  console.log(`[WebExtract] Found ${results.length} emails from ${domain}: ${results.join(', ') || 'none'}`);

  return results;
}

/**
 * Find emails matching a specific person
 * @param {string} domain - Company domain
 * @param {string} firstName - Person's first name
 * @param {string} lastName - Person's last name
 * @returns {string[]} - Emails that might belong to this person (sorted by likelihood)
 */
async function extractEmailsForPerson(domain, firstName, lastName) {
  const allEmails = await extractEmailsFromDomain(domain);

  if (allEmails.length === 0) {
    return [];
  }

  const f = firstName.toLowerCase().trim();
  const l = lastName.toLowerCase().trim();
  const fi = f[0] || '';
  const li = l[0] || '';

  // Score emails by how likely they match the person
  const scored = allEmails.map(email => {
    const local = email.split('@')[0];
    let score = 0;

    // Exact patterns
    if (local === `${f}.${l}`) score = 100;
    else if (local === `${f}${l}`) score = 100;
    else if (local === `${l}.${f}`) score = 100;
    else if (local === `${l}${f}`) score = 100;
    else if (local === `${f}_${l}`) score = 100;
    else if (local === `${f}-${l}`) score = 100;

    // Partial patterns
    else if (local === `${f}${li}`) score = 90;
    else if (local === `${fi}${l}`) score = 90;
    else if (local === `${f}.${li}`) score = 90;
    else if (local === `${fi}.${l}`) score = 90;
    else if (local === `${l}${fi}`) score = 85;
    else if (local === `${li}${f}`) score = 85;

    // First name only
    else if (local === f) score = 70;

    // Last name only
    else if (local === l) score = 60;

    // Contains both
    else if (local.includes(f) && local.includes(l)) score = 80;

    // Contains first name
    else if (local.includes(f)) score = 50;

    // Contains last name
    else if (local.includes(l)) score = 40;

    return { email, score };
  });

  // Return emails sorted by score (highest first), only those with score > 0
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.email);
}

/**
 * Cleanup browser on process exit
 */
async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

// Cleanup on exit
process.on('exit', closeBrowser);
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit();
});
process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit();
});

module.exports = {
  extractEmailsFromDomain,
  extractEmailsForPerson,
  extractEmailsFromPage,
  closeBrowser
};
