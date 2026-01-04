/**
 * LearnMore — Expandable disclosure section
 *
 * Click to expand. Smooth animation. Clean by default.
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';

interface LearnMoreProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function LearnMore({ title, children, defaultOpen = false }: LearnMoreProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [height, setHeight] = useState<number | undefined>(defaultOpen ? undefined : 0);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      const contentHeight = contentRef.current.scrollHeight;
      setHeight(isOpen ? contentHeight : 0);
    }
  }, [isOpen]);

  // Update height when content changes
  useEffect(() => {
    if (isOpen && contentRef.current) {
      const observer = new ResizeObserver(() => {
        if (contentRef.current) {
          setHeight(contentRef.current.scrollHeight);
        }
      });
      observer.observe(contentRef.current);
      return () => observer.disconnect();
    }
  }, [isOpen]);

  return (
    <div className="mt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/60 transition-colors"
      >
        <ChevronRight
          size={12}
          strokeWidth={2}
          className={`transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
        />
        <span>{title}</span>
      </button>

      <div
        style={{ height }}
        className="overflow-hidden transition-[height] duration-200 ease-out"
      >
        <div ref={contentRef} className="pt-3">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * LearnMoreCard — Styled content card for inside LearnMore
 */
interface LearnMoreCardProps {
  children: React.ReactNode;
}

export function LearnMoreCard({ children }: LearnMoreCardProps) {
  return (
    <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.06]">
      {children}
    </div>
  );
}

/**
 * LearnMoreList — Bullet list for learn more content
 */
interface LearnMoreListProps {
  items: string[];
}

export function LearnMoreList({ items }: LearnMoreListProps) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-[12px] text-white/60">
          <span className="text-emerald-400/60 mt-0.5">→</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default LearnMore;
