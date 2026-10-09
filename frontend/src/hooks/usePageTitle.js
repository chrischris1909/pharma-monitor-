import { useEffect } from 'react';

export function usePageTitle(title) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title ? `${title} | Pharma Monitor` : 'Pharma Monitor';
    return () => {
      document.title = prevTitle;
    };
  }, [title]);
}
