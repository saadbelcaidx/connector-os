import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// =============================================================================
// JUNGIAN AI LAYERS - THE SEVEN MINDS
// =============================================================================

interface LayerResult {
  passed: boolean;
  score?: number;
  issues?: string[];
}

interface PipelineData {
  compositeScore?: number;
  usedSelfCorrection?: boolean;
  selfCorrectionRounds?: number;
  leverageScore?: number;
  deleteProbability?: number;
  contextScore?: number;
  momentumScore?: number;
  qualityGatePassed?: boolean;
  qualityGateIssues?: string[];
  doctrineGuardianPassed?: boolean;
  doctrineGuardianViolations?: string[];
  redTeamPassed?: boolean;
  redTeamRisks?: string[];
  threadCoherencePassed?: boolean;
  threadCoherenceIssues?: string[];
  dealMomentumPassed?: boolean;
  dealMomentumIssues?: string[];
  latencyMs?: number;
}

interface AILayersPipelineProps {
  data?: PipelineData;
  isProcessing?: boolean;
  onComplete?: () => void;
}

// The Seven Jungian Layers
const LAYERS = [
  {
    id: 'animus',
    name: 'Animus',
    subtitle: 'The Creator',
    description: 'Generates the reply',
    color: 'from-violet-500 to-purple-600',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-500/30',
    textColor: 'text-violet-400',
    glowColor: 'shadow-violet-500/20',
  },
  {
    id: 'ego',
    name: 'Ego',
    subtitle: 'The Gatekeeper',
    description: 'Quality & safety',
    color: 'from-emerald-500 to-green-600',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    textColor: 'text-emerald-400',
    glowColor: 'shadow-emerald-500/20',
  },
  {
    id: 'senex',
    name: 'Senex',
    subtitle: 'The Elder',
    description: 'Doctrine & leverage',
    color: 'from-amber-500 to-orange-600',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    textColor: 'text-amber-400',
    glowColor: 'shadow-amber-500/20',
  },
  {
    id: 'shadow',
    name: 'Shadow',
    subtitle: 'The Mirror',
    description: 'Adversarial check',
    color: 'from-red-500 to-rose-600',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    textColor: 'text-red-400',
    glowColor: 'shadow-red-500/20',
  },
  {
    id: 'anima',
    name: 'Anima',
    subtitle: 'The Weaver',
    description: 'Thread coherence',
    color: 'from-cyan-500 to-blue-600',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
    textColor: 'text-cyan-400',
    glowColor: 'shadow-cyan-500/20',
  },
  {
    id: 'magician',
    name: 'Magician',
    subtitle: 'The Mover',
    description: 'Deal momentum',
    color: 'from-fuchsia-500 to-pink-600',
    bgColor: 'bg-fuchsia-500/10',
    borderColor: 'border-fuchsia-500/30',
    textColor: 'text-fuchsia-400',
    glowColor: 'shadow-fuchsia-500/20',
  },
  {
    id: 'self',
    name: 'Self',
    subtitle: 'The Whole',
    description: 'Integration',
    color: 'from-white to-gray-300',
    bgColor: 'bg-white/10',
    borderColor: 'border-white/30',
    textColor: 'text-white',
    glowColor: 'shadow-white/20',
  },
];

function LayerNode({
  layer,
  index,
  isActive,
  isComplete,
  score,
  passed,
  isProcessing,
}: {
  layer: typeof LAYERS[0];
  index: number;
  isActive: boolean;
  isComplete: boolean;
  score?: number;
  passed?: boolean;
  isProcessing: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: isComplete || isActive ? 1 : 0.3,
        scale: isActive ? 1.05 : 1,
      }}
      transition={{
        delay: index * 0.1,
        duration: 0.4,
        ease: [0.4, 0, 0.2, 1]
      }}
      className="relative flex flex-col items-center"
    >
      {/* Connection line to next */}
      {index < LAYERS.length - 1 && (
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: isComplete ? 1 : 0 }}
          transition={{ delay: index * 0.1 + 0.3, duration: 0.3 }}
          className="absolute top-6 left-[calc(50%+24px)] w-[calc(100%-48px)] h-[2px] origin-left"
          style={{
            background: isComplete
              ? `linear-gradient(90deg, ${layer.textColor.replace('text-', 'rgb(var(--')}) 0%, transparent 100%)`
              : 'rgba(255,255,255,0.1)',
          }}
        />
      )}

      {/* Node */}
      <motion.div
        animate={isActive ? {
          boxShadow: [
            '0 0 0 0 rgba(255,255,255,0)',
            '0 0 20px 4px rgba(255,255,255,0.1)',
            '0 0 0 0 rgba(255,255,255,0)',
          ]
        } : {}}
        transition={{ repeat: isActive ? Infinity : 0, duration: 1.5 }}
        className={`
          relative w-12 h-12 rounded-xl border-2 flex items-center justify-center
          transition-all duration-300
          ${isComplete ? layer.bgColor : 'bg-white/[0.02]'}
          ${isComplete ? layer.borderColor : 'border-white/[0.08]'}
          ${isActive ? 'ring-2 ring-white/20' : ''}
        `}
      >
        {/* Processing spinner */}
        {isActive && isProcessing && (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            className="absolute inset-0 rounded-xl border-2 border-transparent border-t-white/40"
          />
        )}

        {/* Score or check */}
        {isComplete && score !== undefined ? (
          <span className={`text-sm font-bold ${layer.textColor}`}>
            {score}
          </span>
        ) : isComplete ? (
          <motion.svg
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className={`w-5 h-5 ${layer.textColor}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </motion.svg>
        ) : (
          <span className="text-[10px] font-bold text-white/20">{index + 1}</span>
        )}
      </motion.div>

      {/* Label */}
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: isComplete || isActive ? 1 : 0.4, y: 0 }}
        transition={{ delay: index * 0.1 + 0.2 }}
        className="mt-2 text-center"
      >
        <div className={`text-[11px] font-semibold ${isComplete ? layer.textColor : 'text-white/40'}`}>
          {layer.name}
        </div>
        <div className="text-[9px] text-white/30">{layer.subtitle}</div>
      </motion.div>
    </motion.div>
  );
}

export default function AILayersPipeline({ data, isProcessing = false, onComplete }: AILayersPipelineProps) {
  const [activeLayer, setActiveLayer] = useState(-1);
  const [completedLayers, setCompletedLayers] = useState<number[]>([]);

  // Animate through layers when processing
  useEffect(() => {
    if (isProcessing && activeLayer < 0) {
      setActiveLayer(0);
      setCompletedLayers([]);
    }
  }, [isProcessing]);

  // Progress through layers
  useEffect(() => {
    if (isProcessing && activeLayer >= 0 && activeLayer < LAYERS.length) {
      const timer = setTimeout(() => {
        setCompletedLayers(prev => [...prev, activeLayer]);
        if (activeLayer < LAYERS.length - 1) {
          setActiveLayer(prev => prev + 1);
        } else {
          setActiveLayer(-1);
          onComplete?.();
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [activeLayer, isProcessing]);

  // When data arrives, show all complete
  useEffect(() => {
    if (data && !isProcessing) {
      setCompletedLayers([0, 1, 2, 3, 4, 5, 6]);
      setActiveLayer(-1);
    }
  }, [data, isProcessing]);

  // Extract scores from data
  const getLayerScore = (layerId: string): number | undefined => {
    if (!data) return undefined;
    switch (layerId) {
      case 'senex': return data.leverageScore;
      case 'shadow': return data.deleteProbability ? 10 - data.deleteProbability : undefined;
      case 'anima': return data.contextScore;
      case 'magician': return data.momentumScore;
      case 'self': return data.compositeScore ? Math.round(data.compositeScore) : undefined;
      default: return undefined;
    }
  };

  const getLayerPassed = (layerId: string): boolean | undefined => {
    if (!data) return undefined;
    switch (layerId) {
      case 'ego': return data.qualityGatePassed;
      case 'senex': return data.doctrineGuardianPassed;
      case 'shadow': return data.redTeamPassed;
      case 'anima': return data.threadCoherencePassed;
      case 'magician': return data.dealMomentumPassed;
      default: return true;
    }
  };

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-serif text-violet-400">Ψ</span>
          <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            Psyche
          </span>
        </div>
        {data?.latencyMs && (
          <span className="text-[10px] text-white/30 font-mono">
            {data.latencyMs}ms
          </span>
        )}
      </div>

      {/* Pipeline */}
      <div className="grid grid-cols-7 gap-1">
        {LAYERS.map((layer, index) => (
          <LayerNode
            key={layer.id}
            layer={layer}
            index={index}
            isActive={activeLayer === index}
            isComplete={completedLayers.includes(index)}
            score={getLayerScore(layer.id)}
            passed={getLayerPassed(layer.id)}
            isProcessing={isProcessing}
          />
        ))}
      </div>

      {/* Composite Score */}
      <AnimatePresence>
        {data?.compositeScore && !isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="mt-6 p-4 rounded-xl bg-gradient-to-r from-white/[0.04] to-transparent border border-white/[0.08]"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Composite Score</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-white">{data.compositeScore.toFixed(1)}</span>
                  <span className="text-[11px] text-white/30">/ 10</span>
                </div>
              </div>

              {/* Score breakdown */}
              <div className="flex gap-3">
                {data.leverageScore && (
                  <div className="text-center">
                    <div className="text-[10px] text-amber-400/60">Leverage</div>
                    <div className="text-sm font-semibold text-amber-400">{data.leverageScore}</div>
                  </div>
                )}
                {data.contextScore && (
                  <div className="text-center">
                    <div className="text-[10px] text-cyan-400/60">Context</div>
                    <div className="text-sm font-semibold text-cyan-400">{data.contextScore}</div>
                  </div>
                )}
                {data.momentumScore && (
                  <div className="text-center">
                    <div className="text-[10px] text-fuchsia-400/60">Momentum</div>
                    <div className="text-sm font-semibold text-fuchsia-400">{data.momentumScore}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Self-correction indicator */}
            {data.usedSelfCorrection && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-2"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400/80">
                  Self-corrected ({data.selfCorrectionRounds} round{data.selfCorrectionRounds !== 1 ? 's' : ''})
                </span>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Layer descriptions on hover - hidden for now, can be expanded */}
    </div>
  );
}
