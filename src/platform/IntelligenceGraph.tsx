/**
 * INTELLIGENCE GRAPH
 *
 * Orbital visualization - feels like watching a live satellite feed.
 * Nodes orbit, connections pulse, hot signals glow.
 */

import { useEffect, useRef, useState } from 'react';
import { Building2, User, Radar, ExternalLink, Mail, Linkedin, TrendingUp, UserPlus, Briefcase, Handshake, CheckCircle, ArrowUpRight, Link2, Circle, ShieldAlert } from 'lucide-react';
import type { IntelligenceResult, IntelligenceNode, IntelligenceSignalType, IntelligenceSourceType } from './types';
import { SIGNAL_TYPE_CONFIG, SOURCE_TYPE_CONFIG, toGraph } from './IntelligenceService';

// =============================================================================
// STYLES - Orbital animations, pulse effects, data flow
// =============================================================================

const injectStyles = () => {
  if (document.getElementById('intelligence-graph-styles')) return;
  const style = document.createElement('style');
  style.id = 'intelligence-graph-styles';
  style.textContent = `
    @keyframes graphNodeIn {
      0% { opacity: 0; transform: scale(0) rotate(-180deg); }
      50% { opacity: 1; transform: scale(1.2) rotate(10deg); }
      100% { opacity: 1; transform: scale(1) rotate(0deg); }
    }

    @keyframes orbit {
      from { transform: rotate(0deg) translateX(var(--orbit-radius)) rotate(0deg); }
      to { transform: rotate(360deg) translateX(var(--orbit-radius)) rotate(-360deg); }
    }

    @keyframes orbitReverse {
      from { transform: rotate(360deg) translateX(var(--orbit-radius)) rotate(-360deg); }
      to { transform: rotate(0deg) translateX(var(--orbit-radius)) rotate(0deg); }
    }

    @keyframes pulseGlow {
      0%, 100% {
        box-shadow: 0 0 10px var(--glow-color, rgba(255,255,255,0.1));
        opacity: 0.9;
      }
      50% {
        box-shadow: 0 0 30px var(--glow-color, rgba(255,255,255,0.3)), 0 0 60px var(--glow-color, rgba(255,255,255,0.1));
        opacity: 1;
      }
    }

    @keyframes hotPulse {
      0%, 100% {
        box-shadow: 0 0 15px rgba(251, 146, 60, 0.3), 0 0 30px rgba(251, 146, 60, 0.1);
        border-color: rgba(251, 146, 60, 0.5);
      }
      50% {
        box-shadow: 0 0 30px rgba(251, 146, 60, 0.5), 0 0 60px rgba(251, 146, 60, 0.2);
        border-color: rgba(251, 146, 60, 0.8);
      }
    }

    @keyframes dataPacket {
      0% { offset-distance: 0%; opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 1; }
      100% { offset-distance: 100%; opacity: 0; }
    }

    @keyframes rippleIn {
      0% {
        transform: translate(-50%, -50%) scale(0);
        opacity: 1;
      }
      100% {
        transform: translate(-50%, -50%) scale(3);
        opacity: 0;
      }
    }

    @keyframes scanPulse {
      0%, 100% { opacity: 0.1; transform: scale(1); }
      50% { opacity: 0.3; transform: scale(1.1); }
    }

    @keyframes centerRotate {
      from { transform: translate(-50%, -50%) rotate(0deg); }
      to { transform: translate(-50%, -50%) rotate(360deg); }
    }

    @keyframes float {
      0%, 100% { transform: translate(-50%, -50%) translateY(0px); }
      50% { transform: translate(-50%, -50%) translateY(-5px); }
    }

    .graph-node-enter {
      animation: graphNodeIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }

    .orbit-node {
      animation: orbit var(--orbit-duration, 60s) linear infinite;
    }

    .orbit-node-reverse {
      animation: orbitReverse var(--orbit-duration, 45s) linear infinite;
    }

    .pulse-glow {
      animation: pulseGlow 3s ease-in-out infinite;
    }

    .hot-signal {
      animation: hotPulse 1.5s ease-in-out infinite;
    }

    .ripple-effect {
      animation: rippleIn 1s ease-out forwards;
    }

    .scan-pulse {
      animation: scanPulse 2s ease-in-out infinite;
    }

    .center-rotate {
      animation: centerRotate 20s linear infinite;
    }

    .float-gentle {
      animation: float 4s ease-in-out infinite;
    }

    .font-mono-tight {
      font-family: 'SF Mono', 'Fira Code', 'Monaco', monospace;
      letter-spacing: -0.02em;
    }

    .data-packet {
      offset-path: var(--packet-path);
      animation: dataPacket 2s linear infinite;
    }
  `;
  document.head.appendChild(style);
};

// =============================================================================
// SIGNAL ICONS
// =============================================================================

const SignalIcon = ({ type, size = 14 }: { type: IntelligenceSignalType; size?: number }) => {
  const props = { size, className: 'text-current' };
  switch (type) {
    case 'funding': return <TrendingUp {...props} />;
    case 'exec_change': return <UserPlus {...props} />;
    case 'hiring': return <Briefcase {...props} />;
    case 'acquisition': return <Handshake {...props} />;
    case 'certification': return <CheckCircle {...props} />;
    case 'expansion': return <ArrowUpRight {...props} />;
    case 'partnership': return <Link2 {...props} />;
    default: return <Circle {...props} />;
  }
};

// =============================================================================
// PROPS
// =============================================================================

interface IntelligenceGraphProps {
  query: string;
  results: IntelligenceResult[];
  onSelectCompany?: (result: IntelligenceResult) => void;
  isLoading?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function IntelligenceGraph({
  query,
  results,
  onSelectCompany,
  isLoading = false,
}: IntelligenceGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 450 });
  const [showRipples, setShowRipples] = useState<string[]>([]);

  useEffect(() => {
    injectStyles();
  }, []);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: Math.max(450, rect.height) });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Trigger ripples when results change
  useEffect(() => {
    if (results.length > 0) {
      results.forEach((_, i) => {
        setTimeout(() => {
          setShowRipples(prev => [...prev, `ripple-${i}`]);
        }, i * 200);
      });
    }
    return () => setShowRipples([]);
  }, [results]);

  // Transform to graph
  const { nodes, edges } = toGraph(query, results);

  // Calculate positions
  const centerX = dimensions.width / 2;
  const centerY = dimensions.height / 2;
  const companyRadius = Math.min(dimensions.width, dimensions.height) * 0.30;
  const contactRadius = companyRadius + 80;

  const companyNodes = nodes.filter(n => n.type === 'company');
  const contactNodes = nodes.filter(n => n.type === 'contact');

  const getNodePosition = (node: IntelligenceNode, index: number) => {
    if (node.type === 'query') {
      return { x: centerX, y: centerY };
    }
    if (node.type === 'company') {
      const angle = (index / companyNodes.length) * 2 * Math.PI - Math.PI / 2;
      return {
        x: centerX + Math.cos(angle) * companyRadius,
        y: centerY + Math.sin(angle) * companyRadius,
      };
    }
    const companyIndex = parseInt(node.id.split('-')[1]);
    const angle = (companyIndex / companyNodes.length) * 2 * Math.PI - Math.PI / 2;
    return {
      x: centerX + Math.cos(angle) * contactRadius,
      y: centerY + Math.sin(angle) * contactRadius,
    };
  };

  const handleNodeClick = (node: IntelligenceNode) => {
    setSelectedId(node.id);
    if (node.type === 'company' && node.data && onSelectCompany) {
      onSelectCompany(node.data);
    }
  };

  // Determine if signal is "hot" (high urgency)
  const isHotSignal = (signalType: IntelligenceSignalType) => {
    return ['funding', 'exec_change', 'acquisition'].includes(signalType);
  };

  // Loading state
  if (isLoading) {
    return (
      <div
        ref={containerRef}
        className="w-full h-[450px] rounded-2xl bg-black/40 border border-emerald-500/20 flex items-center justify-center relative overflow-hidden"
      >
        {/* Scanning rings */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-64 h-64 rounded-full border border-emerald-500/10 scan-pulse" />
          <div className="absolute w-48 h-48 rounded-full border border-emerald-500/15 scan-pulse" style={{ animationDelay: '0.5s' }} />
          <div className="absolute w-32 h-32 rounded-full border border-emerald-500/20 scan-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <div className="flex flex-col items-center gap-4 z-10">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
            <Radar className="absolute inset-0 m-auto w-6 h-6 text-emerald-400" />
          </div>
          <div className="text-[13px] text-emerald-400/80 font-mono-tight">SCANNING NETWORKS...</div>
        </div>
      </div>
    );
  }

  // Empty state
  if (results.length === 0) {
    return (
      <div
        ref={containerRef}
        className="w-full h-[450px] rounded-2xl bg-black/40 border border-white/[0.06] flex items-center justify-center"
      >
        <div className="text-center">
          <ShieldAlert className="w-12 h-12 text-white/20 mx-auto mb-3" />
          <div className="text-[14px] text-white/50 font-mono-tight">NO ENTITIES DETECTED</div>
          <div className="text-[12px] text-white/30 mt-1 font-mono-tight">Adjust scan parameters</div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-[450px] rounded-2xl bg-black/40 border border-emerald-500/10 overflow-hidden relative"
    >
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Orbital rings (static visual) */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute rounded-full border border-emerald-500/10"
          style={{
            left: centerX,
            top: centerY,
            width: companyRadius * 2,
            height: companyRadius * 2,
            transform: 'translate(-50%, -50%)',
          }}
        />
        <div
          className="absolute rounded-full border border-white/[0.04]"
          style={{
            left: centerX,
            top: centerY,
            width: contactRadius * 2,
            height: contactRadius * 2,
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>

      {/* Live indicator */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <div className="w-2 h-2 rounded-full bg-emerald-400 pulse-glow" style={{ '--glow-color': 'rgba(52, 211, 153, 0.5)' } as any} />
        <span className="text-[11px] text-emerald-400/80 font-mono-tight">LIVE FEED</span>
      </div>

      {/* SVG for edges with data packets */}
      <svg
        width={dimensions.width}
        height={dimensions.height}
        className="absolute inset-0 pointer-events-none"
      >
        <defs>
          <linearGradient id="edgeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(52, 211, 153, 0.1)" />
            <stop offset="50%" stopColor="rgba(52, 211, 153, 0.3)" />
            <stop offset="100%" stopColor="rgba(52, 211, 153, 0.1)" />
          </linearGradient>
        </defs>

        {edges.map((edge, i) => {
          const sourceNode = nodes.find(n => n.id === edge.source);
          const targetNode = nodes.find(n => n.id === edge.target);
          if (!sourceNode || !targetNode) return null;

          const sourceIndex = sourceNode.type === 'company'
            ? companyNodes.findIndex(n => n.id === sourceNode.id)
            : 0;
          const targetIndex = targetNode.type === 'company'
            ? companyNodes.findIndex(n => n.id === targetNode.id)
            : contactNodes.findIndex(n => n.id === targetNode.id);

          const source = getNodePosition(sourceNode, sourceIndex);
          const target = getNodePosition(targetNode, targetIndex);

          return (
            <g key={`edge-${i}`}>
              {/* Base line */}
              <line
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke="rgba(52, 211, 153, 0.15)"
                strokeWidth={1}
              />
              {/* Animated pulse along line */}
              <circle r="3" fill="rgba(52, 211, 153, 0.6)">
                <animateMotion
                  dur={`${2 + i * 0.3}s`}
                  repeatCount="indefinite"
                  path={`M${source.x},${source.y} L${target.x},${target.y}`}
                />
              </circle>
            </g>
          );
        })}
      </svg>

      {/* Center node - ICP TARGET */}
      <div
        className="absolute z-10"
        style={{
          left: centerX,
          top: centerY,
          transform: 'translate(-50%, -50%)',
        }}
      >
        {/* Ripple effect on load */}
        <div
          className="absolute inset-0 rounded-full bg-emerald-500/20 ripple-effect pointer-events-none"
          style={{ width: 100, height: 100, left: -10, top: -10 }}
        />
        <div className="relative float-gentle">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30 flex items-center justify-center pulse-glow"
            style={{ '--glow-color': 'rgba(52, 211, 153, 0.3)' } as any}
          >
            <Radar className="w-8 h-8 text-emerald-400" />
          </div>
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <span className="text-[10px] text-emerald-400/60 font-mono-tight tracking-wider">ICP TARGET</span>
          </div>
        </div>
      </div>

      {/* Company nodes */}
      {companyNodes.map((node, index) => {
        const pos = getNodePosition(node, index);
        const isSelected = selectedId === node.id;
        const signalConfig = SIGNAL_TYPE_CONFIG[node.signalType || 'other'];
        const isHot = isHotSignal(node.signalType || 'other');

        return (
          <div
            key={node.id}
            className={`absolute graph-node-enter cursor-pointer group ${isHot ? 'hot-signal' : ''}`}
            style={{
              left: pos.x,
              top: pos.y,
              transform: 'translate(-50%, -50%)',
              animationDelay: `${index * 0.15}s`,
              zIndex: isSelected ? 20 : 10,
            }}
            onClick={() => handleNodeClick(node)}
          >
            {/* Impact ripple on appear */}
            {showRipples.includes(`ripple-${index}`) && (
              <div
                className="absolute rounded-full bg-emerald-500/30 ripple-effect pointer-events-none"
                style={{ width: 120, height: 120, left: -60, top: -60 }}
              />
            )}

            <div className={`
              relative px-4 py-3 rounded-xl
              bg-gradient-to-br from-white/[0.08] to-white/[0.02]
              border transition-all duration-300
              backdrop-blur-sm
              ${isSelected
                ? 'border-emerald-500/50 shadow-[0_0_40px_rgba(52,211,153,0.2)]'
                : isHot
                  ? 'border-orange-500/30'
                  : 'border-white/[0.1] hover:border-emerald-500/30 hover:shadow-[0_0_30px_rgba(52,211,153,0.1)]'
              }
            `}>
              {/* Score badge */}
              <div
                className={`absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold font-mono-tight ${isHot ? 'pulse-glow' : ''}`}
                style={{
                  background: isHot ? 'rgba(251, 146, 60, 0.2)' : `${signalConfig.color}20`,
                  color: isHot ? '#fb923c' : signalConfig.color,
                  border: `1px solid ${isHot ? 'rgba(251, 146, 60, 0.4)' : signalConfig.color + '40'}`,
                  '--glow-color': isHot ? 'rgba(251, 146, 60, 0.3)' : undefined,
                } as any}
              >
                {node.score}
              </div>

              {/* Company name */}
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-4 h-4 text-white/40" />
                <span className="text-[13px] font-medium text-white/90 max-w-[130px] truncate font-mono-tight">
                  {node.label}
                </span>
              </div>

              {/* Signal */}
              <div className="flex items-center gap-1.5">
                <div
                  className="w-4 h-4 rounded flex items-center justify-center"
                  style={{ background: `${signalConfig.color}30`, color: signalConfig.color }}
                >
                  <SignalIcon type={node.signalType || 'other'} size={10} />
                </div>
                <span className="text-[11px] text-white/50 max-w-[110px] truncate">
                  {node.sublabel}
                </span>
              </div>

              {/* Signal type badge */}
              <div
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[9px] font-mono-tight tracking-wider"
                style={{
                  background: `${signalConfig.color}15`,
                  color: signalConfig.color,
                  border: `1px solid ${signalConfig.color}30`,
                }}
              >
                {signalConfig.label.toUpperCase()}
              </div>
            </div>
          </div>
        );
      })}

      {/* Contact nodes */}
      {contactNodes.map((node, index) => {
        const pos = getNodePosition(node, index);

        return (
          <div
            key={node.id}
            className="absolute graph-node-enter"
            style={{
              left: pos.x,
              top: pos.y,
              transform: 'translate(-50%, -50%)',
              animationDelay: `${(companyNodes.length + index) * 0.15}s`,
              zIndex: 5,
            }}
          >
            <div className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center">
                  <User className="w-3 h-3 text-cyan-400" />
                </div>
                <span className="text-[11px] font-medium text-white/70 max-w-[80px] truncate font-mono-tight">
                  {node.label}
                </span>
              </div>
              {node.sublabel && (
                <div className="text-[9px] text-white/40 mt-0.5 max-w-[90px] truncate ml-7 font-mono-tight">
                  {node.sublabel}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Stats bar */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-[10px] text-white/40 font-mono-tight">
        <div className="flex items-center gap-4">
          <span className="text-emerald-400">{results.length} ENTITIES</span>
          <span>{results.filter(r => r.contact?.email).length} CONTACTS</span>
        </div>
        <div className="flex items-center gap-3">
          {Object.entries(
            results.reduce((acc, r) => {
              acc[r.company.signalType] = (acc[r.company.signalType] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          ).slice(0, 4).map(([type, count]) => (
            <div key={type} className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: SIGNAL_TYPE_CONFIG[type as IntelligenceSignalType]?.color || '#6b7280' }}
              />
              <span>{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// DETAIL PANEL
// =============================================================================

interface CompanyDetailProps {
  result: IntelligenceResult;
  onConnect?: () => void;
  onClose?: () => void;
}

export function CompanyDetail({ result, onConnect, onClose }: CompanyDetailProps) {
  const { company, contact } = result;
  const signalConfig = SIGNAL_TYPE_CONFIG[company.signalType];
  const sourceConfig = SOURCE_TYPE_CONFIG[company.sourceType];
  const isHot = ['funding', 'exec_change', 'acquisition'].includes(company.signalType);

  return (
    <div className="p-5 rounded-xl bg-black/60 border border-white/[0.08] backdrop-blur-md">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[16px] font-semibold text-white/90 font-mono-tight">{company.companyName}</h3>
          {company.companyDomain && (
            <a
              href={`https://${company.companyDomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-white/40 hover:text-emerald-400 flex items-center gap-1 font-mono-tight"
            >
              {company.companyDomain}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <div
          className={`px-3 py-1.5 rounded-lg text-[12px] font-bold font-mono-tight ${isHot ? 'hot-signal' : ''}`}
          style={{
            background: isHot ? 'rgba(251, 146, 60, 0.15)' : `${signalConfig.color}15`,
            color: isHot ? '#fb923c' : signalConfig.color,
            border: `1px solid ${isHot ? 'rgba(251, 146, 60, 0.3)' : signalConfig.color + '30'}`,
          }}
        >
          {company.matchScore}% MATCH
        </div>
      </div>

      {/* Signal */}
      <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] mb-4">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-6 h-6 rounded flex items-center justify-center"
            style={{ background: `${signalConfig.color}20`, color: signalConfig.color }}
          >
            <SignalIcon type={company.signalType} size={14} />
          </div>
          <span className="text-[13px] font-medium text-white/80 font-mono-tight">{signalConfig.label.toUpperCase()}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40 font-mono-tight">
            {sourceConfig.label}
          </span>
        </div>
        <p className="text-[13px] text-white/60">{company.signalTitle}</p>
        {company.signalDate && (
          <p className="text-[11px] text-white/30 mt-1 font-mono-tight">{company.signalDate}</p>
        )}
      </div>

      {/* Contact */}
      {contact?.fullName ? (
        <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <User className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-white/80 font-mono-tight">{contact.fullName}</div>
              {contact.title && (
                <div className="text-[11px] text-white/40 truncate font-mono-tight">{contact.title}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-emerald-500/20 flex items-center justify-center transition-colors"
                >
                  <Mail className="w-4 h-4 text-white/50" />
                </a>
              )}
              {contact.linkedinUrl && (
                <a
                  href={contact.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-emerald-500/20 flex items-center justify-center transition-colors"
                >
                  <Linkedin className="w-4 h-4 text-white/50" />
                </a>
              )}
            </div>
          </div>
          <div className="mt-2 text-[10px] text-emerald-400/60 font-mono-tight tracking-wider">
            ● VERIFIED CONTACT
          </div>
        </div>
      ) : (
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] mb-4">
          <div className="flex items-center gap-2 text-white/30">
            <User className="w-4 h-4" />
            <span className="text-[12px] font-mono-tight">NO CONTACT DATA</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {onConnect && contact?.email && (
          <button
            onClick={onConnect}
            className="flex-1 h-10 rounded-lg bg-emerald-500 text-black text-[13px] font-bold font-mono-tight hover:bg-emerald-400 active:scale-[0.98] transition-all"
          >
            CONNECT
          </button>
        )}
        <a
          href={company.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="h-10 px-4 rounded-lg border border-white/[0.1] text-white/50 text-[12px] flex items-center gap-2 hover:bg-white/[0.04] transition-colors font-mono-tight"
        >
          SOURCE
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
