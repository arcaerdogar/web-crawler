function getBaseDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split('.');
  if (parts.length <= 2) return parts.join('.');
  return parts.slice(-2).join('.');
}

export function normalizeUrl(raw: string, base: string): string | null {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  let originHost: string;
  try {
    originHost = new URL(base).hostname;
  } catch {
    return null;
  }
  if (getBaseDomain(url.hostname) !== getBaseDomain(originHost)) return null;

  url.hostname = url.hostname.toLowerCase();
  url.hash = '';

  const trackingParams = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term',
    'utm_content', 'ref', 'fbclid', 'gclid'
  ];
  trackingParams.forEach(p => url.searchParams.delete(p));

  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}
