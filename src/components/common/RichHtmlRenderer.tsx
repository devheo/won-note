import React, { useState, useEffect } from 'react';
import { resolveAssetUrlsInHtml } from '../../utils/assetResolver';

interface RichHtmlRendererProps {
  html: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const RichHtmlRenderer: React.FC<RichHtmlRendererProps> = ({ html, className = '', style, onClick }) => {
  const [renderedHtml, setRenderedHtml] = useState<string>(html);

  useEffect(() => {
    let isMounted = true;
    resolveAssetUrlsInHtml(html).then((resolved) => {
      if (isMounted) {
        setRenderedHtml(resolved);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [html]);

  return (
    <div
      className={className}
      style={style}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
};
