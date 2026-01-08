import { useState, useEffect } from 'react';
import { Copy, Mail, Linkedin, Check, Send, Lock } from 'lucide-react';
import {
  PersonData,
  EnrichmentStatus,
  isEnrichmentStale,
  calculateOutboundReadiness,
  getDaysSinceEnrichment,
  validateCopyQuality
} from './services/PersonEnrichmentService';
import type { SupplyContact } from './services/ApolloSupplyEnrichmentService';
import type { SupplyCompany } from './services/SupplySignalsClient';
import { cleanCompanyName } from './services/IntroBuilder';
import type { PressureDetectionResult } from './pressure/PressureDetector';
import { humanizeRoleType } from './services/PressureWiringService';
import {
  TrustedSupplyPools,
  getPoolEntry,
  getTierLabel,
  getTierStyle
} from './services/TrustedSupplyPools';
import type { TrustedDemandPools } from './services/TrustedDemandPools';

type OutboundChannel = 'email' | 'linkedin' | 'manual';
type SendState = 'not_sent' | 'sent' | 'replied';

interface PersonContactCardProps {
  personData: PersonData | null;
  targetTitles: string[];
  isEnriching: boolean;
  onEnrichClick: () => void;
  enrichmentConfigured: boolean;
  intro?: string;
  onRefreshContact?: () => void;
  onConversationStarted?: () => void;
  demandStatus?: string;
  supplyStatus?: string;
  signalId?: number;
  onSendToDemand?: () => void;
  onSendToSupply?: () => void;
  onSendBoth?: () => void;
  onSkip?: () => void;
  hasDemandCampaign?: boolean;
  hasSupplyCampaign?: boolean;
  onRetryWithAlternateTitles?: () => void;
  isSendingDemand?: boolean;
  isSendingSupply?: boolean;
  // Supply contact (person at supply company)
  supplyContact?: SupplyContact | null;
  selectedSupply?: SupplyCompany | null;
  alternativeSupply?: SupplyCompany[];
  onSwitchSupply?: (supply: SupplyCompany) => void;
  isEnrichingSupply?: boolean;
  supplyIntro?: string;
  demandIntro?: string;
  // Supply confirmation (Option B)
  onConfirmAsSupplier?: () => void;
  companyName?: string;
  companyDomain?: string;
  // Pressure detection for contextual narration
  pressureDetection?: PressureDetectionResult | null;
  // Trusted supply pools for tier display
  trustedSupplyPools?: TrustedSupplyPools;
  // Trusted demand pools for tier display
  trustedDemandPools?: TrustedDemandPools;
  // Rotation applied - when provider was rotated to avoid overuse
  rotationApplied?: boolean;
  // Hide individual send buttons when batch mode is active
  hideSendButtons?: boolean;
}

function getStatusBadge(status: EnrichmentStatus) {
  switch (status) {
    case 'ready':
      return {
        text: '',
        className: 'hidden'
      };
    case 'contact_unverified':
      return {
        text: 'Unverified',
        className: 'text-white/50 bg-white/[0.06]'
      };
    case 'found_no_contact':
      return {
        text: 'No contact',
        className: 'text-white/40 bg-white/5'
      };
    case 'not_found':
      return {
        text: 'Not found',
        className: 'text-white/30 bg-white/5'
      };
    case 'none':
    default:
      return {
        text: 'Not enriched',
        className: 'text-white/25 bg-white/[0.03]'
      };
  }
}

export function PersonContactCard({
  personData,
  targetTitles,
  isEnriching,
  onEnrichClick,
  enrichmentConfigured,
  intro,
  onRefreshContact,
  onConversationStarted,
  demandStatus = 'not_sent',
  supplyStatus = 'not_sent',
  signalId,
  onSendToDemand,
  onSendToSupply,
  onSendBoth,
  onSkip,
  hasDemandCampaign = false,
  hasSupplyCampaign = false,
  onRetryWithAlternateTitles,
  isSendingDemand = false,
  isSendingSupply = false,
  supplyContact,
  selectedSupply,
  alternativeSupply = [],
  onSwitchSupply,
  isEnrichingSupply = false,
  supplyIntro,
  demandIntro,
  onConfirmAsSupplier,
  companyName,
  companyDomain,
  pressureDetection,
  trustedSupplyPools,
  trustedDemandPools,
  rotationApplied = false,
  hideSendButtons = false
}: PersonContactCardProps) {
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<OutboundChannel>('email');
  const [sendState, setSendState] = useState<SendState>('not_sent');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Provider selection now handled by Route To cards in MatchingEngineV3

  useEffect(() => {
    if (personData?.email) {
      setSelectedChannel('email');
    } else if (personData?.linkedin) {
      setSelectedChannel('linkedin');
    } else {
      setSelectedChannel('manual');
    }
  }, [personData?.email, personData?.linkedin]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem(label);
      setTimeout(() => setCopiedItem(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };


  const checkRecentContact = (): boolean => {
    const lastContactKey = `lastContact_${personData?.email || personData?.name}`;
    const lastContact = localStorage.getItem(lastContactKey);

    if (lastContact) {
      const daysSince = (Date.now() - parseInt(lastContact)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) {
        setToastMessage('You already reached this company recently. Try again later.');
        setTimeout(() => setToastMessage(null), 3000);
        return false;
      }
    }

    return true;
  };

  const recordContact = () => {
    const lastContactKey = `lastContact_${personData?.email || personData?.name}`;
    localStorage.setItem(lastContactKey, Date.now().toString());
  };

  const handleSendEmail = () => {
    if (!personData?.email || !intro) return;

    if (!checkRecentContact()) return;

    const mailtoLink = `mailto:${personData.email}?body=${encodeURIComponent(intro)}`;
    window.location.href = mailtoLink;

    recordContact();
    setSendState('sent');
    if (onConversationStarted) {
      onConversationStarted();
    }
  };

  const handleLinkedInSend = async () => {
    if (!personData?.linkedin || !intro) return;

    if (!checkRecentContact()) return;

    await copyToClipboard(intro, 'intro');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);

    window.open(personData.linkedin, '_blank');

    recordContact();
    setSendState('sent');
    if (onConversationStarted) {
      onConversationStarted();
    }
  };

  if (personData && (personData.name || personData.email || personData.title)) {
    const status = personData.status || 'none';
    const statusBadge = getStatusBadge(status);
    const isStale = isEnrichmentStale(personData.enrichedAt);
    const daysSince = getDaysSinceEnrichment(personData.enrichedAt);
    const outboundReadiness = calculateOutboundReadiness(personData);
    const copyValidation = intro ? validateCopyQuality(personData, intro) : { valid: false, reason: 'No intro available' };

    const isGettingStale = daysSince >= 7 && daysSince <= 30;
    const isTooStale = daysSince > 30;

    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 relative">
        {showToast && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white/90 text-black px-3 py-1.5 rounded-lg text-[10px] font-medium shadow-lg z-50 whitespace-nowrap">
            Intro copied
          </div>
        )}
        {toastMessage && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white/70 text-black px-3 py-1.5 rounded-lg text-[10px] font-medium shadow-lg z-50 whitespace-nowrap">
            {toastMessage}
          </div>
        )}

        {/* Two-column layout for Demand and Supply contacts */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* DEMAND CONTACT - person at hiring company */}
          <div className="bg-white/[0.02] rounded-lg p-2.5 border border-white/[0.04]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] uppercase tracking-wider text-white/40">Company</span>
              {outboundReadiness === 'ready' && (
                <span className="text-[9px] px-1.5 py-0.5 rounded text-white/50 bg-white/[0.04]">●</span>
              )}
              {outboundReadiness === 'needs_review' && (
                <span className="text-[9px] px-1.5 py-0.5 rounded text-white/50 bg-white/[0.06]">◐</span>
              )}
            </div>
            {personData.name ? (
              <div className="space-y-0.5">
                <div className="text-[11px] font-medium text-white truncate">{personData.name}</div>
                {personData.title && <div className="text-[10px] text-white/60 truncate">{personData.title}</div>}
                {personData.email && <div className="text-[9px] text-white/50 truncate">{personData.email}</div>}
              </div>
            ) : (
              <div className="text-[10px] text-white/40">Not enriched yet</div>
            )}
          </div>

          {/* SUPPLY CONTACT - person at provider company */}
          <div className="bg-white/[0.02] rounded-lg p-2.5 border border-white/[0.04] relative">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] uppercase tracking-wider text-white/40">Provider</span>
              {isEnrichingSupply && (
                <span className="text-[9px] px-1.5 py-0.5 rounded text-white/40 bg-white/[0.04]">...</span>
              )}
              {supplyContact?.email && !isEnrichingSupply && (
                <span className="text-[9px] px-1.5 py-0.5 rounded text-white/50 bg-white/[0.04]">●</span>
              )}
            </div>

            {/* Provider selector - shows matched provider (selection via Route To cards above) */}
            {selectedSupply && (
              <div className="mb-1.5 relative">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-white/60 truncate block text-left">
                    {cleanCompanyName(supplyContact?.company || selectedSupply.name)}
                  </span>
                  {/* Strong match label - shown when quality ranked */}
                  {selectedSupply.qualityScore !== undefined && (
                    <span
                      className="text-[9px] px-1 py-0.5 bg-emerald-500/10 text-emerald-400/80 rounded whitespace-nowrap"
                      title={selectedSupply.rankingReason?.join(' • ') || 'Strong match for this role'}
                    >
                      Strong match
                    </span>
                  )}
                  {/* Trusted badge + tier - shown for pool members */}
                  {(() => {
                    const roleType = pressureDetection?.roleType;
                    const poolEntry = roleType && trustedSupplyPools
                      ? getPoolEntry(trustedSupplyPools, roleType, selectedSupply.domain)
                      : null;
                    if (!poolEntry) return null;
                    return (
                      <>
                        <span className="text-[9px] px-1 py-0.5 bg-white/5 text-white/50 rounded whitespace-nowrap">
                          trusted
                        </span>
                        <span className={`text-[9px] px-1 py-0.5 rounded whitespace-nowrap ${getTierStyle(poolEntry.tier)}`}>
                          {getTierLabel(poolEntry.tier)}
                        </span>
                      </>
                    );
                  })()}
                </div>
                {/* Show why matched - category label (clean, consistent) */}
                <div className="text-[9px] text-white/40 truncate mt-0.5">
                  {selectedSupply.hireCategory !== 'unknown'
                    ? `${selectedSupply.hireCategory.charAt(0).toUpperCase() + selectedSupply.hireCategory.slice(1)} staffing`
                    : /recruit|staffing|talent/i.test(selectedSupply.name)
                      ? 'Staffing & Recruiting'
                      : /consult/i.test(selectedSupply.name)
                        ? 'Consulting'
                        : 'Service Provider'
                  }
                </div>
                {/* Pressure-based selection narration */}
                {pressureDetection?.pressureDetected && (
                  <div className="text-[9px] text-white/25 truncate mt-0.5">
                    Matched to {humanizeRoleType(pressureDetection.roleType).toLowerCase()} pressure
                  </div>
                )}
                {/* Rotation narration - shown when provider was rotated */}
                {rotationApplied && (
                  <div className="text-[9px] text-amber-400/50 truncate mt-0.5">
                    Rotated to avoid overusing the same provider
                  </div>
                )}

              </div>
            )}

            {isEnrichingSupply ? (
              <div className="text-[10px] text-white/40 flex items-center gap-1.5">
                <span className="h-2 w-2 animate-spin rounded-full border border-white/30 border-t-transparent" />
                Searching...
              </div>
            ) : supplyContact?.email ? (
              <div className="space-y-0.5">
                <div className="text-[11px] font-medium text-white truncate">{supplyContact.name}</div>
                <div className="text-[10px] text-white/60 truncate">{supplyContact.title}</div>
                <div className="text-[9px] text-white/50 truncate">{supplyContact.email}</div>
              </div>
            ) : selectedSupply && !isEnrichingSupply ? (
              // Enrichment done but no contact found - show helpful message
              <div className="space-y-1">
                <div className="text-[10px] text-white/40">No contact found</div>
                {alternativeSupply.length > 0 && (
                  <div className="text-[9px] text-white/30">Try another provider ▴</div>
                )}
              </div>
            ) : (
              <div className="text-[10px] text-white/40">Enrich to find contact</div>
            )}
          </div>
        </div>

        {/* Legacy single contact display - keeping for detailed view */}
        <div className="space-y-1.5 text-[11px] text-white/85 hidden">
          {personData.name && (
            <div className="font-medium text-white">
              {personData.name}
              {personData.title && (
                <span className="text-white/60 font-normal"> • {personData.title}</span>
              )}
            </div>
          )}

          {personData.email && (
            <div className="text-white/80 break-all">
              {personData.email}
            </div>
          )}

          {personData.linkedin && (
            <a
              href={personData.linkedin}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-white/50 hover:text-white/70 underline underline-offset-2 inline-block"
            >
              LinkedIn →
            </a>
          )}

          {/* Option B: Confirm as Supplier - shown when contact has email and callback provided */}
          {onConfirmAsSupplier && personData.email && (
            <button
              onClick={onConfirmAsSupplier}
              className="mt-2 text-[10px] text-white/50 hover:text-white/70 bg-white/[0.04] hover:bg-white/[0.08] px-2 py-1 rounded transition-colors"
            >
              + Confirm as Supplier
            </button>
          )}

          {isGettingStale && !isTooStale && (
            <div className="text-[10px] text-white/50 bg-white/[0.04] px-2 py-1.5 rounded mt-2 flex items-center justify-between">
              <span>Contact may be getting stale</span>
              {onRefreshContact && (
                <button
                  onClick={onRefreshContact}
                  className="text-[9px] text-white/50 hover:text-white/70 underline underline-offset-2"
                >
                  Refresh contact
                </button>
              )}
            </div>
          )}

          {isTooStale && (
            <div className="text-[10px] text-white/50 bg-white/[0.04] px-2 py-1.5 rounded mt-2 flex items-center justify-between">
              <span>Contact data is over 30 days old</span>
              {onRefreshContact && (
                <button
                  onClick={onRefreshContact}
                  className="text-[9px] text-white/50 hover:text-white/70 underline underline-offset-2"
                >
                  Refresh now
                </button>
              )}
            </div>
          )}

          {status === 'contact_unverified' && (
            <div className="text-[10px] text-white/60 bg-white/5 px-2 py-1 rounded mt-2">
              Contact found but confidence is low. Consider verifying before outreach.
            </div>
          )}

          {status === 'found_no_contact' && (
            <div className="text-[10px] text-white/60 bg-white/5 px-2 py-1 rounded mt-2">
              Person found but no email or LinkedIn available.
            </div>
          )}

          {!copyValidation.valid && outboundReadiness === 'ready' && (
            <div className="text-[10px] text-white/50 bg-white/[0.04] px-2 py-1 rounded mt-2">
              {copyValidation.reason}
            </div>
          )}

          {typeof personData.confidence === 'number' && (
            <div className="text-[9px] text-white/40 mt-1">
              Match: {personData.confidence >= 80 ? 'strong' : personData.confidence >= 50 ? 'likely' : 'possible'}
            </div>
          )}

          {outboundReadiness === 'ready' && copyValidation.valid && (
            <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-2">
              {sendState === 'not_sent' && (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-white/40 uppercase tracking-wider">Via:</span>
                    <div className="flex items-center gap-1">
                      {personData.email && (
                        <button
                          onClick={() => setSelectedChannel('email')}
                          className={`flex items-center gap-1 px-2 py-0.5 text-[9px] rounded transition-colors ${
                            selectedChannel === 'email'
                              ? 'bg-white/[0.08] text-white/80'
                              : 'bg-white/[0.03] text-white/50 hover:bg-white/[0.06]'
                          }`}
                        >
                          <Mail size={10} />
                          Email
                        </button>
                      )}
                      {personData.linkedin && (
                        <button
                          onClick={() => setSelectedChannel('linkedin')}
                          className={`flex items-center gap-1 px-2 py-0.5 text-[9px] rounded transition-colors ${
                            selectedChannel === 'linkedin'
                              ? 'bg-white/[0.08] text-white/80'
                              : 'bg-white/[0.03] text-white/50 hover:bg-white/[0.06]'
                          }`}
                        >
                          <Linkedin size={10} />
                          LinkedIn
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedChannel('manual')}
                        className={`flex items-center gap-1 px-2 py-0.5 text-[9px] rounded transition-colors ${
                          selectedChannel === 'manual'
                            ? 'bg-white/[0.08] text-white/80'
                            : 'bg-white/[0.03] text-white/50 hover:bg-white/[0.06]'
                        }`}
                      >
                        <Copy size={10} />
                        Manual
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedChannel === 'email' && personData.email && (
                      <button
                        onClick={handleSendEmail}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded-lg bg-white/90 text-black hover:bg-white transition-colors font-medium"
                      >
                        <Send size={12} />
                        Open email
                      </button>
                    )}

                    {selectedChannel === 'linkedin' && personData.linkedin && (
                      <button
                        onClick={handleLinkedInSend}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded-lg bg-white/90 text-black hover:bg-white transition-colors font-medium"
                      >
                        <Linkedin size={12} />
                        Open LinkedIn
                      </button>
                    )}

                    {selectedChannel === 'manual' && (
                      <button
                        onClick={() => {
                          if (!checkRecentContact()) return;

                          if (intro) {
                            copyToClipboard(intro, 'intro');
                          }
                          recordContact();
                          setSendState('sent');
                          if (onConversationStarted) {
                            onConversationStarted();
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded-lg bg-white/90 text-black hover:bg-white transition-colors font-medium"
                      >
                        <Copy size={12} />
                        Copy
                      </button>
                    )}
                  </div>

                </>
              )}

              {sendState === 'sent' && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[10px] text-white/50">
                    <Lock size={10} />
                    <span>Started</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSendState('not_sent')}
                      className="text-[9px] text-white/40 hover:text-white/60 underline underline-offset-2"
                    >
                      Reset
                    </button>
                    <button
                      onClick={() => setSendState('replied')}
                      className="text-[9px] text-white/50 hover:text-white/70 underline underline-offset-2"
                    >
                      Mark replied
                    </button>
                  </div>
                </div>
              )}

              {sendState === 'replied' && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[10px] text-white/60">
                    <Check size={10} />
                    <span>Replied</span>
                  </div>
                  <button
                    onClick={() => setSendState('sent')}
                    className="text-[9px] text-white/40 hover:text-white/60 underline underline-offset-2"
                  >
                    Undo
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Deploy Section - hidden when batch mode active */}
        {!hideSendButtons && (hasDemandCampaign || hasSupplyCampaign) && (
          <div className="mt-3 pt-3 border-t border-white/[0.04]">
            <div className="text-[9px] uppercase tracking-wider text-white/30 mb-2">Send</div>

            {/* Buttons row */}
            <div className="flex items-center gap-2">
              {hasDemandCampaign && (
                <button
                  type="button"
                  onClick={() => {
                    console.log('[PersonContactCard] Demand clicked');
                    onSendToDemand?.();
                  }}
                  disabled={!onSendToDemand || !personData?.email || demandStatus === 'sent' || isSendingDemand}
                  title={!personData?.email ? 'No demand contact email' : undefined}
                  className={`px-3 py-1.5 text-[10px] rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                    demandStatus !== 'sent' && !isSendingDemand && personData?.email
                      ? 'bg-white/[0.06] border border-white/[0.08] text-white/70 hover:bg-white/[0.10]'
                      : 'bg-white/[0.02] border border-white/[0.04] text-white/25 cursor-not-allowed'
                  }`}
                >
                  {isSendingDemand ? (
                    <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-white/30 border-t-transparent" />
                  ) : demandStatus === 'sent' ? (
                    '✓ Company'
                  ) : (
                    'Company'
                  )}
                </button>
              )}
              {hasSupplyCampaign && (
                <button
                  type="button"
                  onClick={() => {
                    console.log('[PersonContactCard] Supply clicked');
                    onSendToSupply?.();
                  }}
                  disabled={!onSendToSupply || supplyStatus === 'sent' || isSendingSupply || !supplyContact?.email}
                  title={!supplyContact?.email ? 'No supply contact found' : undefined}
                  className={`px-3 py-1.5 text-[10px] rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                    supplyStatus !== 'sent' && !isSendingSupply && supplyContact?.email
                      ? 'bg-white/[0.06] border border-white/[0.08] text-white/70 hover:bg-white/[0.10]'
                      : 'bg-white/[0.02] border border-white/[0.04] text-white/25 cursor-not-allowed'
                  }`}
                >
                  {isSendingSupply ? (
                    <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-white/30 border-t-transparent" />
                  ) : supplyStatus === 'sent' ? (
                    '✓ Provider'
                  ) : (
                    'Provider'
                  )}
                </button>
              )}
              {hasDemandCampaign && hasSupplyCampaign && (
                <button
                  type="button"
                  onClick={() => {
                    console.log('[PersonContactCard] Both clicked');
                    onSendBoth?.();
                  }}
                  disabled={!onSendBoth || (demandStatus === 'sent' && supplyStatus === 'sent') || isSendingDemand || isSendingSupply || !supplyContact?.email || !personData?.email}
                  title={!supplyContact?.email ? 'No supply contact' : !personData?.email ? 'No demand contact' : undefined}
                  className={`px-3 py-1.5 text-[10px] rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                    !(demandStatus === 'sent' && supplyStatus === 'sent') && !isSendingDemand && !isSendingSupply && supplyContact?.email && personData?.email
                      ? 'bg-white/90 text-black hover:bg-white'
                      : 'bg-white/[0.02] border border-white/[0.04] text-white/25 cursor-not-allowed'
                  }`}
                >
                  {(isSendingDemand || isSendingSupply) ? (
                    <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-black/30 border-t-transparent" />
                  ) : (demandStatus === 'sent' && supplyStatus === 'sent') ? (
                    '✓ Sent'
                  ) : (
                    'Both'
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Fallback when no Instantly campaigns configured */}
        {!hasDemandCampaign && !hasSupplyCampaign && (
          <div className="mt-3 pt-3 border-t border-white/[0.04] text-[10px] text-white/30">
            Add Instantly campaigns in Settings to send.
          </div>
        )}
      </div>
    );
  }

  if (isEnriching) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] uppercase tracking-wider text-white/40">
            Contact
          </span>
          <span className="text-[9px] text-white/40 flex items-center gap-1.5">
            <span className="h-2 w-2 animate-spin rounded-full border border-white/30 border-t-transparent" />
            Searching...
          </span>
        </div>
        <div className="space-y-2">
          <div className="h-3 w-28 rounded bg-white/[0.04]" />
          <div className="h-2.5 w-40 rounded bg-white/[0.03]" />
          <div className="h-2.5 w-32 rounded bg-white/[0.03]" />
        </div>
      </div>
    );
  }

  // Handle "not_found" status - no good decision maker found
  if (personData?.status === 'not_found') {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-white/50">
            Person to contact
          </span>
          <span className="text-[10px] text-white/40 bg-white/[0.04] px-2 py-0.5 rounded-full">
            No good match
          </span>
        </div>
        <div className="space-y-3">
          <div className="text-[12px] text-white/70">
            Couldn't find the right person for this signal.
          </div>
          {personData.notFoundReason && (
            <div className="text-[10px] text-white/50 bg-white/5 px-2 py-1.5 rounded">
              {personData.notFoundReason}
            </div>
          )}
          <div className="flex gap-2">
            {onRetryWithAlternateTitles && (
              <button
                onClick={onRetryWithAlternateTitles}
                className="flex-1 text-[11px] px-3 py-2 rounded-xl bg-white/[0.08] text-white/70 hover:bg-white/[0.12] transition-all duration-200 font-medium"
              >
                Try other titles
              </button>
            )}
            {onRefreshContact && (
              <button
                onClick={onRefreshContact}
                className="flex-1 text-[11px] px-3 py-2 rounded-xl bg-white/10 text-white/70 hover:bg-white/15 transition-all duration-200"
              >
                Retry enrichment
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] uppercase tracking-wider text-white/40">
          Contact
        </span>
        {!enrichmentConfigured && (
          <span className="text-[9px] text-white/50 bg-white/[0.06] px-2 py-0.5 rounded">
            Configure in Settings
          </span>
        )}
      </div>

      <p className="text-[11px] text-white/50 mb-3">
        No contact yet.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {targetTitles.length > 0 && (
          <div className="text-[9px] text-white/30 mb-1 w-full">Target titles:</div>
        )}
        {targetTitles.slice(0, 5).map((title) => (
          <span
            key={title}
            className="rounded border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[10px] text-white/60"
          >
            {title}
          </span>
        ))}
      </div>

      {enrichmentConfigured && (
        <button
          type="button"
          onClick={onEnrichClick}
          disabled={isEnriching}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-[10px] font-medium text-black hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Find contact
        </button>
      )}
    </div>
  );
}
