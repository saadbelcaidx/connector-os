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
}

function getStatusBadge(status: EnrichmentStatus) {
  switch (status) {
    case 'ready':
      return {
        text: 'Ready to reach',
        className: 'text-emerald-300/90 bg-emerald-300/10'
      };
    case 'contact_unverified':
      return {
        text: 'Needs verification',
        className: 'text-amber-300/90 bg-amber-300/10'
      };
    case 'found_no_contact':
      return {
        text: 'Found no contact',
        className: 'text-orange-300/90 bg-orange-300/10'
      };
    case 'not_found':
      return {
        text: 'No good match',
        className: 'text-red-300/90 bg-red-300/10'
      };
    case 'none':
    default:
      return {
        text: 'Not enriched',
        className: 'text-white/40 bg-white/5'
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
  demandIntro
}: PersonContactCardProps) {
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<OutboundChannel>('email');
  const [sendState, setSendState] = useState<SendState>('not_sent');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showSupplyDropdown, setShowSupplyDropdown] = useState(false);

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
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-[0_0_40px_rgba(38,247,199,0.08)] backdrop-blur relative">
        {showToast && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-emerald-300 text-black px-3 py-1.5 rounded-lg text-[10px] font-medium shadow-lg z-50 whitespace-nowrap">
            Intro copied — paste into LinkedIn
          </div>
        )}
        {toastMessage && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-amber-400 text-black px-3 py-1.5 rounded-lg text-[10px] font-medium shadow-lg z-50 whitespace-nowrap">
            {toastMessage}
          </div>
        )}

        {/* Two-column layout for Demand and Supply contacts */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* DEMAND CONTACT - person at hiring company */}
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/10">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] uppercase tracking-wider text-blue-400/80">Demand</span>
              {outboundReadiness === 'ready' && (
                <span className="text-[8px] px-1.5 py-0.5 rounded-full text-emerald-300/90 bg-emerald-300/10">Ready</span>
              )}
              {outboundReadiness === 'needs_review' && (
                <span className="text-[8px] px-1.5 py-0.5 rounded-full text-amber-300/90 bg-amber-300/10">Review</span>
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
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/10 relative">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] uppercase tracking-wider text-purple-400/80">Supply</span>
              {isEnrichingSupply && (
                <span className="text-[8px] px-1.5 py-0.5 rounded-full text-white/50 bg-white/10">Finding...</span>
              )}
              {supplyContact?.email && !isEnrichingSupply && (
                <span className="text-[8px] px-1.5 py-0.5 rounded-full text-emerald-300/90 bg-emerald-300/10">Ready</span>
              )}
            </div>

            {/* Supply selector */}
            {selectedSupply && (
              <div className="mb-1.5">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-purple-300/70 truncate">{selectedSupply.name}</span>
                  {alternativeSupply.length > 0 && (
                    <button
                      onClick={() => setShowSupplyDropdown(!showSupplyDropdown)}
                      className="text-[8px] text-purple-400/60 hover:text-purple-400 px-1 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 transition-colors"
                    >
                      Switch
                    </button>
                  )}
                </div>
                <div className="text-[8px] text-white/30 truncate">{selectedSupply.specialty}</div>

                {/* Supply dropdown */}
                {showSupplyDropdown && alternativeSupply.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-neutral-900 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
                    <div className="text-[8px] text-white/40 px-2 py-1 border-b border-white/5">Switch supply</div>
                    {alternativeSupply.map((supply) => (
                      <button
                        key={supply.domain}
                        onClick={() => {
                          onSwitchSupply?.(supply);
                          setShowSupplyDropdown(false);
                        }}
                        className="w-full text-left px-2 py-1.5 hover:bg-white/5 transition-colors"
                      >
                        <div className="text-[10px] text-white/80">{supply.name}</div>
                        <div className="text-[8px] text-white/40">{supply.specialty}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isEnrichingSupply ? (
              <div className="text-[10px] text-white/40 flex items-center gap-1.5">
                <span className="h-2 w-2 animate-spin rounded-full border border-purple-400/50 border-t-transparent" />
                Searching {selectedSupply?.name || 'supply'}...
              </div>
            ) : supplyContact?.email ? (
              <div className="space-y-0.5">
                <div className="text-[11px] font-medium text-white truncate">{supplyContact.name}</div>
                <div className="text-[10px] text-white/60 truncate">{supplyContact.title}</div>
                <div className="text-[9px] text-white/50 truncate">{supplyContact.email}</div>
              </div>
            ) : selectedSupply && !isEnrichingSupply ? (
              // Enrichment done but no contact found
              <div className="text-[10px] text-orange-400/80">No supply decision-maker found</div>
            ) : (
              <div className="text-[10px] text-white/40">Select signal first</div>
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
              className="text-[11px] text-emerald-300 hover:text-emerald-200 underline underline-offset-2 inline-block"
            >
              LinkedIn profile →
            </a>
          )}

          {isGettingStale && !isTooStale && (
            <div className="text-[10px] text-amber-300/70 bg-amber-300/10 px-2 py-1.5 rounded mt-2 flex items-center justify-between">
              <span>Contact may be getting stale</span>
              {onRefreshContact && (
                <button
                  onClick={onRefreshContact}
                  className="text-[9px] text-amber-300 hover:text-amber-200 underline underline-offset-2"
                >
                  Refresh contact
                </button>
              )}
            </div>
          )}

          {isTooStale && (
            <div className="text-[10px] text-orange-300/70 bg-orange-300/10 px-2 py-1.5 rounded mt-2 flex items-center justify-between">
              <span>Contact data is over 30 days old</span>
              {onRefreshContact && (
                <button
                  onClick={onRefreshContact}
                  className="text-[9px] text-orange-300 hover:text-orange-200 underline underline-offset-2"
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
            <div className="text-[10px] text-amber-300/70 bg-amber-300/10 px-2 py-1 rounded mt-2">
              {copyValidation.reason}
            </div>
          )}

          {typeof personData.confidence === 'number' && (
            <div className="text-[9px] text-white/40 mt-1">
              Confidence: {Math.round(personData.confidence)}%
            </div>
          )}

          {outboundReadiness === 'ready' && copyValidation.valid && (
            <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
              {sendState === 'not_sent' && (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-white/50 uppercase tracking-wider">Channel:</span>
                    <div className="flex items-center gap-1">
                      {personData.email && (
                        <button
                          onClick={() => setSelectedChannel('email')}
                          className={`flex items-center gap-1 px-2 py-0.5 text-[9px] rounded transition-colors ${
                            selectedChannel === 'email'
                              ? 'bg-emerald-300/20 text-emerald-300'
                              : 'bg-white/5 text-white/60 hover:bg-white/10'
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
                              ? 'bg-emerald-300/20 text-emerald-300'
                              : 'bg-white/5 text-white/60 hover:bg-white/10'
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
                            ? 'bg-emerald-300/20 text-emerald-300'
                            : 'bg-white/5 text-white/60 hover:bg-white/10'
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
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded-lg bg-emerald-300 text-black hover:bg-emerald-200 transition-colors font-medium"
                      >
                        <Send size={12} />
                        Open email draft
                      </button>
                    )}

                    {selectedChannel === 'linkedin' && personData.linkedin && (
                      <button
                        onClick={handleLinkedInSend}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded-lg bg-emerald-300 text-black hover:bg-emerald-200 transition-colors font-medium"
                      >
                        <Linkedin size={12} />
                        Open LinkedIn message
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
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded-lg bg-emerald-300 text-black hover:bg-emerald-200 transition-colors font-medium"
                      >
                        <Copy size={12} />
                        Copy and mark sent
                      </button>
                    )}
                  </div>

                </>
              )}

              {sendState === 'sent' && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[10px] text-white/60">
                    <Lock size={10} />
                    <span>Conversation started</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSendState('not_sent')}
                      className="text-[9px] text-white/50 hover:text-white/70 underline underline-offset-2"
                    >
                      Mark no reply yet
                    </button>
                    <button
                      onClick={() => setSendState('replied')}
                      className="text-[9px] text-emerald-300/80 hover:text-emerald-300 underline underline-offset-2"
                    >
                      Mark replied
                    </button>
                  </div>
                </div>
              )}

              {sendState === 'replied' && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[10px] text-emerald-300/90">
                    <Check size={10} />
                    <span>Got a reply</span>
                  </div>
                  <button
                    onClick={() => setSendState('sent')}
                    className="text-[9px] text-white/50 hover:text-white/70 underline underline-offset-2"
                  >
                    Undo
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* INSTANTLY CAMPAIGNS - Visible section for sending to campaigns */}
        {(hasDemandCampaign || hasSupplyCampaign) && (
          <div className="mt-3 pt-3 border-t border-neutral-800">
            <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Send to Instantly</div>

            {/* Status row */}
            <div className="flex items-center gap-1.5 text-[10px] mb-2">
              {hasDemandCampaign && (
                <span className={`${
                  demandStatus === 'sent' ? 'text-emerald-400'
                  : demandStatus === 'failed' ? 'text-red-400'
                  : 'text-white/40'
                }`}>
                  Demand: {demandStatus === 'sent' ? 'sent' : demandStatus === 'failed' ? 'failed' : 'pending'}
                </span>
              )}
              {hasDemandCampaign && hasSupplyCampaign && (
                <span className="text-white/20">·</span>
              )}
              {hasSupplyCampaign && (
                <span className={`${
                  supplyStatus === 'sent' ? 'text-emerald-400'
                  : supplyStatus === 'failed' ? 'text-red-400'
                  : 'text-white/40'
                }`}>
                  Supply: {supplyStatus === 'sent' ? 'sent' : supplyStatus === 'failed' ? 'failed' : 'pending'}
                </span>
              )}
            </div>

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
                      ? 'bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30'
                      : 'bg-neutral-900/50 border border-neutral-800 text-white/30 cursor-not-allowed'
                  }`}
                >
                  {isSendingDemand ? (
                    <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-blue-400/50 border-t-transparent" />
                  ) : (
                    <>→ Demand</>
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
                      ? 'bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30'
                      : 'bg-neutral-900/50 border border-neutral-800 text-white/30 cursor-not-allowed'
                  }`}
                >
                  {isSendingSupply ? (
                    <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-purple-400/50 border-t-transparent" />
                  ) : (
                    <>→ Supply</>
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
                      ? 'bg-gradient-to-r from-blue-500/30 to-purple-500/30 border border-emerald-500/30 text-emerald-300 hover:opacity-90'
                      : 'bg-neutral-900/50 border border-neutral-800 text-white/30 cursor-not-allowed'
                  }`}
                >
                  {(isSendingDemand || isSendingSupply) ? (
                    <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-emerald-400/50 border-t-transparent" />
                  ) : (
                    <>→ Both</>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Fallback when no Instantly campaigns configured */}
        {!hasDemandCampaign && !hasSupplyCampaign && (
          <div className="mt-3 pt-3 border-t border-neutral-800 text-[10px] text-neutral-500">
            Connect Instantly in Settings to send intros directly.
          </div>
        )}
      </div>
    );
  }

  if (isEnriching) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur animate-pulse">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-white/50">
            Person to contact
          </span>
          <span className="text-[10px] text-emerald-300/80 bg-emerald-300/10 px-2 py-0.5 rounded-full flex items-center gap-1.5">
            <span className="h-2 w-2 animate-spin rounded-full border border-emerald-300/80 border-t-transparent" />
            Enriching…
          </span>
        </div>
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-white/10" />
          <div className="h-3 w-48 rounded bg-white/10" />
          <div className="h-3 w-40 rounded bg-white/10" />
        </div>
      </div>
    );
  }

  // Handle "not_found" status - no good decision maker found
  if (personData?.status === 'not_found') {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-white/50">
            Person to contact
          </span>
          <span className="text-[10px] text-red-300/90 bg-red-300/10 px-2 py-0.5 rounded-full">
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
                className="flex-1 text-[11px] px-3 py-2 rounded-lg bg-amber-400/20 text-amber-300 hover:bg-amber-400/30 transition-colors font-medium"
              >
                Try other titles
              </button>
            )}
            {onRefreshContact && (
              <button
                onClick={onRefreshContact}
                className="flex-1 text-[11px] px-3 py-2 rounded-lg bg-white/10 text-white/70 hover:bg-white/15 transition-colors"
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
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/50">
          Person to contact
        </span>
        {!enrichmentConfigured && (
          <span className="text-[9px] text-amber-300/80 bg-amber-300/10 px-2 py-0.5 rounded-full">
            Configure enrichment in Settings
          </span>
        )}
      </div>

      <p className="text-[11px] text-white/60 mb-3">
        No contact yet. Click <span className="font-semibold text-white/80">Find the person</span> to pull someone in.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {targetTitles.length > 0 && (
          <div className="text-[9px] text-white/40 mb-1 w-full">Target titles:</div>
        )}
        {targetTitles.slice(0, 5).map((title) => (
          <span
            key={title}
            className="rounded-full border border-white/12 bg-black/30 px-2 py-0.5 text-[10px] text-white/80"
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
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-300/90 px-3 py-1 text-[10px] font-medium text-black hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <span className="text-xs">✨</span>
          Find the person
        </button>
      )}
    </div>
  );
}
