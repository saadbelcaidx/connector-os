/**
 * Terms of Service — Compliance page for Connector OS
 * Route: /terms
 * Public, no auth required
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Terms() {
  useEffect(() => {
    document.title = 'Terms of Service — Connector OS';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute('content', 'Terms of Service for Connector OS and Connector Agent services.');
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
        <h1 className="text-[28px] font-semibold text-white/90 mb-2">Terms of Service</h1>
        <p className="text-[13px] text-white/40 mb-12">Last updated: January 2025</p>

        {/* Content */}
        <div className="space-y-10 text-[14px] leading-relaxed">
          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">Service Description</h2>
            <p className="text-white/60">
              Connector OS provides a platform for operators to match demand signals with supply providers.
              Connector Agent is an email finding and verification service integrated within Connector OS.
              By using our services, you agree to these terms.
            </p>
          </section>

          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">Account Registration</h2>
            <p className="text-white/60">
              You must provide accurate information when creating an account. You are responsible for
              maintaining the security of your account credentials and for all activities under your account.
            </p>
          </section>

          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">Acceptable Use</h2>
            <p className="text-white/60 mb-3">You agree not to:</p>
            <ul className="space-y-2 text-white/60">
              <li className="flex gap-2">
                <span className="text-white/30">•</span>
                <span>Use the service for any illegal purpose or in violation of applicable laws.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-white/30">•</span>
                <span>Send unsolicited bulk email (spam) or engage in abusive outreach practices.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-white/30">•</span>
                <span>Attempt to circumvent rate limits, quotas, or access controls.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-white/30">•</span>
                <span>Interfere with or disrupt the service or its infrastructure.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-white/30">•</span>
                <span>Resell or redistribute the service without authorization.</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">API Usage and Rate Limits</h2>
            <p className="text-white/60">
              Connector Agent API access is subject to rate limits and usage quotas. Exceeding these limits
              may result in temporary throttling or suspension. We reserve the right to modify limits as needed
              to maintain service quality.
            </p>
          </section>

          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">No Delivery Guarantees</h2>
            <p className="text-white/60">
              We do not guarantee email deliverability. Email verification indicates syntactic and domain validity,
              not inbox placement. Delivery depends on factors outside our control, including recipient servers,
              content filters, and sending reputation.
            </p>
          </section>

          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">Limitation of Liability</h2>
            <p className="text-white/60">
              The service is provided "as is" without warranties of any kind. We are not liable for any indirect,
              incidental, or consequential damages arising from your use of the service. Our total liability is
              limited to the amount you paid for the service in the past 12 months.
            </p>
          </section>

          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">Account Suspension</h2>
            <p className="text-white/60">
              We reserve the right to suspend or terminate accounts that violate these terms, engage in abuse,
              or pose a risk to other users or our infrastructure. We will make reasonable efforts to notify you
              before suspension, except in cases of severe violations.
            </p>
          </section>

          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">Changes to Terms</h2>
            <p className="text-white/60">
              We may modify these terms at any time. Continued use of the service after changes constitutes
              acceptance of the new terms. Material changes will be communicated via email or in-app notification.
            </p>
          </section>

          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">Governing Law</h2>
            <p className="text-white/60">
              These terms are governed by applicable law. Any disputes will be resolved through good-faith
              negotiation or, if necessary, binding arbitration.
            </p>
          </section>

          <section>
            <h2 className="text-[16px] font-medium text-white/90 mb-3">Contact</h2>
            <p className="text-white/60">
              For questions about these terms, contact us at{' '}
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
            <Link to="/privacy" className="hover:text-white/50 transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
