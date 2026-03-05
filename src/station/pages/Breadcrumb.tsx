/**
 * Breadcrumb -- Minimal breadcrumb navigation
 *
 * Station > Runs > Run #7
 * Each item is a link except the last.
 * Style: font-mono text-[10px] text-white/30
 */

import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface Props {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: Props) {
  return (
    <nav className="flex items-center gap-1.5 font-mono text-[10px] text-white/30 mb-4">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-white/15">{'>'}</span>}
            {item.to && !isLast ? (
              <Link
                to={item.to}
                className="hover:text-white/50 transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-white/50' : ''}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
