/**
 * INLINE HELP LINK — Small "Learn" link that opens docs
 */

import React from 'react';
import { ExternalLink, BookOpen } from 'lucide-react';

export interface InlineHelpLinkProps {
  href: string;
  label?: string;
  icon?: 'external' | 'book';
  className?: string;
}

export const InlineHelpLink: React.FC<InlineHelpLinkProps> = ({
  href,
  label = 'Learn more',
  icon = 'external',
  className = '',
}) => {
  const Icon = icon === 'book' ? BookOpen : ExternalLink;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        inline-flex items-center gap-1 text-xs text-white/40
        hover:text-blue-400 transition-colors
        ${className}
      `}
    >
      <Icon className="w-3 h-3" />
      {label}
    </a>
  );
};

export default InlineHelpLink;
