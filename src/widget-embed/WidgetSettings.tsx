/**
 * Widget Settings — Operator Configuration
 *
 * Allows operators to configure their white-label widget:
 * - Platform Configuration (subdomain, branding, copy)
 * - Network Directory (supply upload)
 * - Embed Code (iframe snippet)
 * - Engagement Intelligence (analytics)
 *
 * ENTERPRISE LANGUAGE: JP Morgan style throughout.
 * NO CASUAL LANGUAGE: "Platform Configuration" not "Widget Settings"
 */

import React, { useState, useCallback, useRef } from 'react';
import Papa from 'papaparse';
import {
  Settings,
  Upload,
  Code,
  BarChart3,
  Check,
  Copy,
  AlertCircle,
  Loader2,
  Palette,
  Globe,
  Type,
  Image,
  Users,
  ExternalLink,
  Trash2,
  FileText,
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface WidgetConfig {
  id?: string;
  subdomain: string;
  company_name: string;
  logo_url?: string;
  primary_color: string;
  background_color: string;
  headline: string;
  cta_text: string;
  enabled: boolean;
}

interface SupplyRecord {
  company: string;
  domain?: string;
  title?: string;
  industry?: string;
  description?: string;
}

interface WidgetSettingsProps {
  userId: string;
  onSave?: (config: WidgetConfig) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const RESERVED_SUBDOMAINS = [
  'www', 'api', 'app', 'admin', 'help', 'support', 'widget',
  'test', 'demo', 'staging', 'mail', 'ftp', 'docs', 'status'
];

const DEFAULT_CONFIG: WidgetConfig = {
  subdomain: '',
  company_name: '',
  logo_url: '',
  primary_color: '#3b82f6',
  background_color: '#000000',
  headline: 'Find your strategic partners',
  cta_text: 'Analyze Fit',
  enabled: true,
};

// =============================================================================
// VALIDATION
// =============================================================================

function isValidSubdomain(subdomain: string): { valid: boolean; error?: string } {
  if (!subdomain) {
    return { valid: false, error: 'Subdomain is required' };
  }

  if (subdomain.length < 3) {
    return { valid: false, error: 'Subdomain must be at least 3 characters' };
  }

  if (subdomain.length > 30) {
    return { valid: false, error: 'Subdomain must be 30 characters or less' };
  }

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(subdomain)) {
    return { valid: false, error: 'Subdomain must be lowercase letters, numbers, and hyphens only' };
  }

  if (RESERVED_SUBDOMAINS.includes(subdomain)) {
    return { valid: false, error: 'This subdomain is reserved' };
  }

  return { valid: true };
}

// =============================================================================
// SECTION COMPONENTS
// =============================================================================

interface SectionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function Section({ title, description, icon, children }: SectionProps) {
  return (
    <div className="widget-card mb-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-2.5 rounded-xl bg-white/[0.06]">
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white/95">{title}</h3>
          <p className="text-sm text-white/50 mt-1">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function WidgetSettings({ userId, onSave }: WidgetSettingsProps) {
  // State
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [supplyData, setSupplyData] = useState<SupplyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [subdomainError, setSubdomainError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Handlers
  const handleSubdomainChange = useCallback((value: string) => {
    const normalized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setConfig(prev => ({ ...prev, subdomain: normalized }));

    if (normalized) {
      const validation = isValidSubdomain(normalized);
      setSubdomainError(validation.error || null);
    } else {
      setSubdomainError(null);
    }
  }, []);

  const handleCopyEmbed = useCallback(() => {
    const embedCode = `<iframe
  src="https://app.connector-os.com/w/${config.subdomain}"
  width="100%"
  height="600"
  frameborder="0"
  sandbox="allow-scripts allow-same-origin"
  allow="clipboard-write"
  style="border-radius: 12px; background: #000000;"
></iframe>`;

    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [config.subdomain]);

  const handleSupplyUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      setError('Invalid file format. Please upload a CSV file.');
      return;
    }

    // Parse CSV with Papa Parse
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const records = results.data as Record<string, string>[];

        // Validate: Check for required column (Company Name)
        if (records.length === 0) {
          setError('CSV file is empty.');
          return;
        }

        const firstRow = records[0];
        const headers = Object.keys(firstRow).map(h => h.toLowerCase().trim());

        // Find company name column (flexible matching)
        const companyColumn = Object.keys(firstRow).find(h => {
          const lower = h.toLowerCase().trim();
          return lower === 'company name' || lower === 'company_name' || lower === 'name' || lower === 'company';
        });

        if (!companyColumn) {
          setError('Missing required column: Company Name. Please include a column named "Company Name", "company_name", or "name".');
          return;
        }

        // Validate max records
        if (records.length > 500) {
          setError(`Exceeded maximum of 500 records. Your file has ${records.length} records.`);
          return;
        }

        // Map to SupplyRecord format
        const supplyRecords: SupplyRecord[] = records
          .filter(row => row[companyColumn]?.trim())
          .map(row => {
            // Find optional columns
            const domainCol = Object.keys(row).find(h => /domain|website|url/i.test(h));
            const titleCol = Object.keys(row).find(h => /title|role|position/i.test(h));
            const industryCol = Object.keys(row).find(h => /industry|sector/i.test(h));
            const descCol = Object.keys(row).find(h => /description|about|summary/i.test(h));

            return {
              company: row[companyColumn]?.trim() || '',
              domain: domainCol ? row[domainCol]?.trim() : undefined,
              title: titleCol ? row[titleCol]?.trim() : undefined,
              industry: industryCol ? row[industryCol]?.trim() : undefined,
              description: descCol ? row[descCol]?.trim() : undefined,
            };
          });

        if (supplyRecords.length === 0) {
          setError('No valid records found in CSV.');
          return;
        }

        // Save to state
        setSupplyData(supplyRecords);
        setError(null);
        setSuccess(`Successfully loaded ${supplyRecords.length} records from CSV.`);

        // Store in localStorage for now (Phase 3 will save to DB)
        localStorage.setItem('widget_supply_data', JSON.stringify(supplyRecords));
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`);
      }
    });

    // Reset input
    event.target.value = '';
  }, []);

  const handleClearSupply = useCallback(() => {
    setSupplyData([]);
    localStorage.removeItem('widget_supply_data');
    setSuccess('Network directory cleared.');
  }, []);

  const handleSave = useCallback(async () => {
    // Validate
    const subdomainValidation = isValidSubdomain(config.subdomain);
    if (!subdomainValidation.valid) {
      setError(subdomainValidation.error || 'Invalid subdomain');
      return;
    }

    if (!config.company_name) {
      setError('Company name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // TODO: Save to Supabase
      // For now, just simulate success
      await new Promise(resolve => setTimeout(resolve, 500));

      setSuccess('Configuration saved successfully');
      onSave?.(config);
    } catch (err) {
      setError('Failed to save configuration');
    } finally {
      setLoading(false);
    }
  }, [config, onSave]);

  // Generate embed code
  const embedCode = config.subdomain
    ? `<iframe
  src="https://app.connector-os.com/w/${config.subdomain}"
  width="100%"
  height="600"
  frameborder="0"
  sandbox="allow-scripts allow-same-origin"
  allow="clipboard-write"
  style="border-radius: 12px; background: #000000;"
></iframe>`
    : '';

  return (
    <div className="widget-root min-h-screen p-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white/95 tracking-tight">
            Platform Configuration
          </h1>
          <p className="text-white/50 mt-2">
            Configure your white-label widget for client-facing deployment.
          </p>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="status-indicator status-indicator-error mb-6">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="status-indicator status-indicator-success mb-6">
            <Check className="w-4 h-4" />
            <span>{success}</span>
          </div>
        )}

        {/* Section 1: Platform Configuration */}
        <Section
          title="Platform Configuration"
          description="Define your widget's identity and branding."
          icon={<Settings className="w-5 h-5 text-white/70" />}
        >
          <div className="space-y-5">
            {/* Subdomain */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                <Globe className="w-4 h-4 inline mr-2" />
                Subdomain
              </label>
              <div className="flex items-center gap-2">
                <span className="text-white/40 text-sm">app.connector-os.com/w/</span>
                <input
                  type="text"
                  value={config.subdomain}
                  onChange={(e) => handleSubdomainChange(e.target.value)}
                  placeholder="your-company"
                  className="widget-input flex-1"
                  aria-label="Widget subdomain"
                />
              </div>
              {subdomainError && (
                <p className="text-red-400 text-xs mt-2">{subdomainError}</p>
              )}
            </div>

            {/* Company Name */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                <Type className="w-4 h-4 inline mr-2" />
                Company Name
              </label>
              <input
                type="text"
                value={config.company_name}
                onChange={(e) => setConfig(prev => ({ ...prev, company_name: e.target.value }))}
                placeholder="Acme Corporation"
                className="widget-input"
                aria-label="Company name"
              />
            </div>

            {/* Logo URL */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                <Image className="w-4 h-4 inline mr-2" />
                Logo URL (optional)
              </label>
              <input
                type="url"
                value={config.logo_url}
                onChange={(e) => setConfig(prev => ({ ...prev, logo_url: e.target.value }))}
                placeholder="https://example.com/logo.png"
                className="widget-input"
                aria-label="Logo URL"
              />
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  <Palette className="w-4 h-4 inline mr-2" />
                  Primary Color
                </label>
                <input
                  type="color"
                  value={config.primary_color}
                  onChange={(e) => setConfig(prev => ({ ...prev, primary_color: e.target.value }))}
                  className="w-full h-10 rounded-lg cursor-pointer bg-transparent border border-white/[0.12]"
                  aria-label="Primary color"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Background Color
                </label>
                <input
                  type="color"
                  value={config.background_color}
                  onChange={(e) => setConfig(prev => ({ ...prev, background_color: e.target.value }))}
                  className="w-full h-10 rounded-lg cursor-pointer bg-transparent border border-white/[0.12]"
                  aria-label="Background color"
                />
              </div>
            </div>

            {/* Headline */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Headline
              </label>
              <input
                type="text"
                value={config.headline}
                onChange={(e) => setConfig(prev => ({ ...prev, headline: e.target.value }))}
                placeholder="Find your strategic partners"
                className="widget-input"
                aria-label="Widget headline"
              />
            </div>

            {/* CTA Text */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Button Text
              </label>
              <input
                type="text"
                value={config.cta_text}
                onChange={(e) => setConfig(prev => ({ ...prev, cta_text: e.target.value }))}
                placeholder="Analyze Fit"
                className="widget-input"
                aria-label="Call to action text"
              />
            </div>
          </div>
        </Section>

        {/* Section 2: Network Directory */}
        <Section
          title="Network Directory"
          description="Upload your supply pool for visitor matching."
          icon={<Users className="w-5 h-5 text-white/70" />}
        >
          <div className="space-y-4">
            {supplyData.length === 0 ? (
              /* Empty state - upload UI */
              <div className="border-2 border-dashed border-white/[0.12] rounded-xl p-8 text-center">
                <Upload className="w-8 h-8 text-white/40 mx-auto mb-4" />
                <p className="text-white/70 mb-2">Upload CSV with your network directory</p>
                <p className="text-white/40 text-sm mb-4">
                  Required: Company Name. Optional: Domain, Title, Industry, Description.
                </p>
                <label className="widget-button widget-button-secondary cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Select CSV File
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleSupplyUpload}
                    className="hidden"
                    aria-label="Upload CSV file"
                  />
                </label>
              </div>
            ) : (
              /* Loaded state - show records */
              <div className="space-y-4">
                <div className="status-indicator status-indicator-success">
                  <FileText className="w-4 h-4" />
                  <span>{supplyData.length} records loaded</span>
                </div>

                {/* Preview first 5 records */}
                <div className="bg-white/[0.03] rounded-xl p-4 space-y-2">
                  <p className="text-xs text-white/50 mb-3">Preview (first 5 records)</p>
                  {supplyData.slice(0, 5).map((record, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.06] last:border-0">
                      <div>
                        <p className="text-sm text-white/90">{record.company}</p>
                        {record.domain && (
                          <p className="text-xs text-white/40">{record.domain}</p>
                        )}
                      </div>
                      {record.industry && (
                        <span className="text-xs text-white/50 bg-white/[0.06] px-2 py-1 rounded">
                          {record.industry}
                        </span>
                      )}
                    </div>
                  ))}
                  {supplyData.length > 5 && (
                    <p className="text-xs text-white/40 text-center pt-2">
                      + {supplyData.length - 5} more records
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <label className="widget-button widget-button-secondary cursor-pointer flex-1">
                    <Upload className="w-4 h-4" />
                    Replace CSV
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleSupplyUpload}
                      className="hidden"
                      aria-label="Replace CSV file"
                    />
                  </label>
                  <button
                    onClick={handleClearSupply}
                    className="widget-button widget-button-ghost text-red-400"
                    aria-label="Clear network directory"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* Section 3: Embed Code */}
        <Section
          title="Embed Code"
          description="Copy this code to embed the widget on your website."
          icon={<Code className="w-5 h-5 text-white/70" />}
        >
          {config.subdomain ? (
            <div className="space-y-4">
              <div className="relative">
                <pre className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 text-sm text-white/70 overflow-x-auto font-mono">
                  {embedCode}
                </pre>
                <button
                  onClick={handleCopyEmbed}
                  className="absolute top-3 right-3 widget-button widget-button-ghost p-2"
                  aria-label="Copy embed code"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>

              <a
                href={`/w/${config.subdomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
              >
                Preview widget
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          ) : (
            <p className="text-white/40 text-sm">
              Enter a subdomain above to generate your embed code.
            </p>
          )}
        </Section>

        {/* Section 4: Engagement Intelligence */}
        <Section
          title="Engagement Intelligence"
          description="Track widget performance and visitor engagement."
          icon={<BarChart3 className="w-5 h-5 text-white/70" />}
        >
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/[0.03] rounded-xl p-4 text-center">
              <p className="text-2xl font-semibold text-white/90">—</p>
              <p className="text-xs text-white/50 mt-1">Views</p>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-4 text-center">
              <p className="text-2xl font-semibold text-white/90">—</p>
              <p className="text-xs text-white/50 mt-1">Simulations</p>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-4 text-center">
              <p className="text-2xl font-semibold text-white/90">—</p>
              <p className="text-xs text-white/50 mt-1">Matches Shown</p>
            </div>
          </div>
          <p className="text-white/40 text-xs mt-4 text-center">
            Analytics data will appear after your widget receives traffic.
          </p>
        </Section>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            disabled={loading || !config.subdomain || !config.company_name}
            className="widget-button widget-button-primary min-w-[140px]"
            aria-label="Save configuration"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4" />
                Save Configuration
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default WidgetSettings;
