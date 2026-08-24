import { useEffect } from 'react';

const SITE_NAME = 'OddWave';
const DEFAULT_DESCRIPTION = 'OddWave — bet on football, basketball, tennis and more. Live odds, cashout, virtuals and instant games.';

function setMetaDescription(content: string): void {
  let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!tag) {
    tag = document.createElement('meta');
    tag.name = 'description';
    document.head.appendChild(tag);
  }
  tag.content = content;
}

/**
 * Sets a unique per-page title and meta description, and restores the site
 * defaults on unmount so navigating away never leaves a stale page's title
 * behind. `description` is optional — omit it on pages that don't need
 * anything more specific than the site-wide default (e.g. account pages
 * `robots.txt` already excludes from indexing).
 */
export function useDocumentMeta(title: string, description?: string): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
    if (description) setMetaDescription(description);
    return () => {
      document.title = previousTitle;
      if (description) setMetaDescription(DEFAULT_DESCRIPTION);
    };
  }, [title, description]);
}
