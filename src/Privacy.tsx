/**
 * Privacy Policy — Compliance page for Connector OS
 * Route: /privacy
 * Public, no auth required
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Privacy() {
  useEffect(() => {
    document.title = 'Privacy Policy — Connector OS';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute('content', 'Privacy Policy for Connector OS and Connector Agent services.');
    }
  }, []);

  return (
    <div className="min-h-screen bg-black text-white/80">
      <div className="max-w-2xl mx-auto px-6 py-16">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-[13px] text-white/40 hover:text-white/60 transition-colors mb-12"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Connector OS
        </Link>

        {/* Header */}
        <h1 className="text-[28px] font-semibold text-white/90 mb-2">Privacy Policy</h1>
        <p className="text-[13px] text-white/40 mb-12">Last updated: January 2025</p>

        {/* Content */}
        <div className="space-y-10 text-[14px] leading-relaxed">
          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">Overview</h2>
            <p className="text-white/60">
              Connector OS ("we", "us", "our") operates the Connector OS platform and Connector Agent service.
              This policy explains how we collect, use, and protect your information.
            </p>
          </section>

          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">Information We Collect</h2>
            <ul className="space-y-2 text-white/60">
              <li className="flex gap-2">
                <span className="text-white/30">•</span>
                <span><strong className="text-white/70">Account information:</strong> Email address and authentication provider data when you create an account.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-white/30">•</span>
                <span><strong className="text-white/70">API usage data:</strong> Request logs, token usage, and service interactions for quota management and service improvement.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-white/30">•</span>
                <span><strong className="text-white/70">Uploaded inputs:</strong> CSV files or Google Sheets data you provide for processing. This data is processed to deliver the service and is not resold or shared.</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">What We Do Not Do</h2>
            <ul className="space-y-2 text-white/60">
              <li className="flex gap-2">
                <span className="text-white/30">•</span>
                <span>We do not sell your data to third parties.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-white/30">•</span>
                <span>We do not use advertising trackers or behavioral targeting.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-white/30">•</span>
                <span>We do not share your uploaded data with other users.</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">Third-Party Services</h2>
            <p className="text-white/60 mb-3">We use the following third-party services to operate:</p>
            <ul className="space-y-2 text-white/60">
              <li className="flex gap-2">
                <span className="text-white/30">•</span>
                <span><strong className="text-white/70">Google:</strong> For Google Sheets integration and OAuth authentication.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-white/30">•</span>
                <span><strong className="text-white/70">Infrastructure providers:</strong> Hosting, database, and logging services necessary to run the platform.</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">Data Retention</h2>
            <ul className="space-y-2 text-white/60">
              <li className="flex gap-2">
                <span className="text-white/30">•</span>
                <span>Uploaded data is processed temporarily for enrichment and is not stored permanently unless you choose to save results.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-white/30">•</span>
                <span>You control your inputs and outputs. You can delete your account and associated data at any time.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-white/30">•</span>
                <span>API usage logs are retained for operational and billing purposes.</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">Your Rights</h2>
            <p className="text-white/60">
              You may request access to, correction of, or deletion of your personal data by contacting us.
              We will respond to requests within a reasonable timeframe.
            </p>
          </section>

          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">Changes to This Policy</h2>
            <p className="text-white/60">
              We may update this policy from time to time. Changes will be posted on this page with an updated revision date.
            </p>
          </section>

          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">Contact</h2>
            <p className="text-white/60">
              For questions about this policy or your data, contact us at{' '}
              <a href="mailto:operator@connector-os.com" className="text-white/70 hover:text-white/90 underline">
                operator@connector-os.com
              </a>
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-white/[0.06]">
          <div className="flex items-center justify-between text-[12px] text-white/30">
            <span>Connector OS</span>
            <Link to="/terms" className="hover:text-white/50 transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
