import React, { memo } from 'react';

interface HighlightTextProps {
  text: string;
  highlight: string;
  className?: string;
}

export const HighlightText: React.FC<HighlightTextProps> = memo(({ text, highlight, className = '' }) => {
  if (!highlight || !highlight.trim() || !text) {
    return <span className={className}>{text}</span>;
  }

  const query = highlight.trim();
  // Escape regex special chars
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const parts = text.split(regex);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.toLowerCase() === query.toLowerCase()) {
          return (
            <mark
              key={i}
              className="bg-amber-300 dark:bg-amber-500 text-stone-950 dark:text-stone-950 px-0.5 rounded font-semibold shadow-xs"
            >
              {part}
            </mark>
          );
        }
        return part;
      })}
    </span>
  );
});

HighlightText.displayName = 'HighlightText';
