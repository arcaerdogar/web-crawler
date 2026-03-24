import { normalizeUrl } from '../src/normalizeUrl.js';

describe('normalizeUrl', () => {
  const base = 'https://example.com';

  it('resolves a relative path against the base', () => {
    expect(normalizeUrl('/about', base)).toBe('https://example.com/about');
  });

  it('resolves a relative path with nested segments', () => {
    expect(normalizeUrl('/docs/intro', base)).toBe('https://example.com/docs/intro');
  });

  it('returns absolute same-domain URL as-is', () => {
    expect(normalizeUrl('https://example.com/page', base)).toBe('https://example.com/page');
  });

  it('rejects cross-domain URLs', () => {
    expect(normalizeUrl('https://other.com/page', base)).toBeNull();
  });

  it('allows subdomains of the same base domain', () => {
    expect(normalizeUrl('https://blog.example.com/post', base)).toBe('https://blog.example.com/post');
    expect(normalizeUrl('https://www.example.com/page', base)).toBe('https://www.example.com/page');
  });

  it('allows links from subdomain base to other subdomains', () => {
    expect(normalizeUrl('https://en.wikipedia.org/', 'https://www.wikipedia.org'))
      .toBe('https://en.wikipedia.org/');
  });

  it('rejects other subdomains when scope is hostname', () => {
    expect(normalizeUrl('https://blog.example.com/post', base, 'hostname')).toBeNull();
    expect(normalizeUrl('https://www.example.com/page', base, 'hostname')).toBeNull();
    expect(normalizeUrl('https://example.com/about', base, 'hostname')).toBe('https://example.com/about');
  });

  it('allows exact hostname when scope is hostname', () => {
    const blogBase = 'https://blog.example.com';
    expect(normalizeUrl('/p', blogBase, 'hostname')).toBe('https://blog.example.com/p');
    expect(normalizeUrl('https://blog.example.com/x', blogBase, 'hostname')).toBe('https://blog.example.com/x');
    expect(normalizeUrl('https://www.example.com/', blogBase, 'hostname')).toBeNull();
  });

  it('allows any http(s) host when scope is unrestricted', () => {
    expect(normalizeUrl('https://other.com/page', base, 'unrestricted')).toBe('https://other.com/page');
    expect(normalizeUrl('https://blog.example.com/x', base, 'unrestricted')).toBe('https://blog.example.com/x');
  });

  it('still rejects non-http protocols when unrestricted', () => {
    expect(normalizeUrl('ftp://other.com/file', base, 'unrestricted')).toBeNull();
  });

  it('rejects non-http protocols', () => {
    expect(normalizeUrl('ftp://example.com/file', base)).toBeNull();
    expect(normalizeUrl('mailto:user@example.com', base)).toBeNull();
    expect(normalizeUrl('javascript:void(0)', base)).toBeNull();
  });

  it('strips URL fragments', () => {
    expect(normalizeUrl('https://example.com/page#section', base)).toBe('https://example.com/page');
  });

  it('removes trailing slashes except root', () => {
    expect(normalizeUrl('https://example.com/page/', base)).toBe('https://example.com/page');
    expect(normalizeUrl('https://example.com/', base)).toBe('https://example.com/');
  });

  it('strips tracking parameters', () => {
    const url = 'https://example.com/page?utm_source=google&utm_medium=cpc&real=1';
    expect(normalizeUrl(url, base)).toBe('https://example.com/page?real=1');
  });

  it('strips all known tracking params', () => {
    const url = 'https://example.com/page?fbclid=abc&gclid=xyz&ref=homepage&utm_campaign=test&utm_term=a&utm_content=b';
    expect(normalizeUrl(url, base)).toBe('https://example.com/page');
  });

  it('lowercases hostname', () => {
    expect(normalizeUrl('https://EXAMPLE.COM/Page', 'https://example.com')).toBe('https://example.com/Page');
  });

  it('returns null for completely invalid URLs', () => {
    expect(normalizeUrl('not a url at all', 'also not valid')).toBeNull();
  });

  it('returns null for invalid base', () => {
    expect(normalizeUrl('', 'not-a-url')).toBeNull();
  });

  it('preserves non-tracking query params', () => {
    expect(normalizeUrl('https://example.com/search?q=test&page=2', base))
      .toBe('https://example.com/search?q=test&page=2');
  });

  it('handles URLs with port numbers', () => {
    expect(normalizeUrl('https://example.com:8080/page', 'https://example.com:8080'))
      .toBe('https://example.com:8080/page');
  });
});
