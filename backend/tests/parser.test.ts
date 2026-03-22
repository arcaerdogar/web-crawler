import { extractLinks, extractText, tokenize, countFrequencies, STOP_WORDS } from '../src/parser.js';

describe('extractLinks', () => {
  it('extracts href from anchor tags', () => {
    const html = '<a href="/about">About</a><a href="/contact">Contact</a>';
    expect(extractLinks(html, 'https://example.com')).toEqual([
      'https://example.com/about',
      'https://example.com/contact'
    ]);
  });

  it('handles double and single quotes', () => {
    const html = `<a href="/double">D</a><a href='/single'>S</a>`;
    expect(extractLinks(html, 'https://example.com')).toEqual([
      'https://example.com/double',
      'https://example.com/single'
    ]);
  });

  it('resolves relative URLs against base', () => {
    const html = '<a href="page.html">Page</a>';
    expect(extractLinks(html, 'https://example.com/dir/')).toEqual([
      'https://example.com/dir/page.html'
    ]);
  });

  it('handles absolute URLs', () => {
    const html = '<a href="https://other.com/page">Link</a>';
    expect(extractLinks(html, 'https://example.com')).toEqual([
      'https://other.com/page'
    ]);
  });

  it('resolves all parseable hrefs and skips broken ones', () => {
    const html = '<a href="">Empty</a><a href="/valid">Good</a>';
    const links = extractLinks(html, 'https://example.com');
    expect(links).toContain('https://example.com/valid');
  });

  it('returns empty array when no links', () => {
    expect(extractLinks('<p>No links</p>', 'https://example.com')).toEqual([]);
  });

  it('handles anchors with extra attributes', () => {
    const html = '<a class="nav" id="home" href="/home" target="_blank">Home</a>';
    expect(extractLinks(html, 'https://example.com')).toEqual([
      'https://example.com/home'
    ]);
  });
});

describe('extractText', () => {
  it('strips HTML tags', () => {
    expect(extractText('<p>Hello <b>world</b></p>').trim()).toBe('Hello  world');
  });

  it('removes script contents', () => {
    const text = extractText('<p>Text</p><script>var x = 1;</script><p>More</p>');
    expect(text).not.toContain('var x');
    expect(text).toContain('Text');
    expect(text).toContain('More');
  });

  it('removes style contents', () => {
    const text = extractText('<style>.foo { color: red; }</style><p>Content</p>');
    expect(text).not.toContain('color');
    expect(text).toContain('Content');
  });

  it('handles nested script tags', () => {
    const text = extractText('<script type="text/javascript">alert("hi")</script><div>Safe</div>');
    expect(text).not.toContain('alert');
    expect(text).toContain('Safe');
  });

  it('returns empty string for empty input', () => {
    expect(extractText('').trim()).toBe('');
  });
});

describe('tokenize', () => {
  it('splits text into lowercase tokens', () => {
    const tokens = tokenize('Hello World');
    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
  });

  it('filters out stop words', () => {
    const tokens = tokenize('the quick brown fox is a very fast animal');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('is');
    expect(tokens).not.toContain('a');
    expect(tokens).toContain('quick');
    expect(tokens).toContain('brown');
    expect(tokens).toContain('fox');
  });

  it('filters out single-character tokens', () => {
    const tokens = tokenize('I am a x test');
    expect(tokens).not.toContain('x');
    expect(tokens).toContain('am');
    expect(tokens).toContain('test');
  });

  it('handles numbers in tokens', () => {
    const tokens = tokenize('page 42 section3');
    expect(tokens).toContain('42');
    expect(tokens).toContain('section3');
    expect(tokens).toContain('page');
  });

  it('splits on non-alphanumeric characters', () => {
    const tokens = tokenize('hello-world foo_bar baz.qux');
    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
    expect(tokens).toContain('foo');
    expect(tokens).toContain('bar');
  });

  it('returns empty array for empty text', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('returns empty array for only stop words', () => {
    expect(tokenize('the is a an')).toEqual([]);
  });

  it('STOP_WORDS set contains expected words', () => {
    expect(STOP_WORDS.has('the')).toBe(true);
    expect(STOP_WORDS.has('been')).toBe(true);
    expect(STOP_WORDS.has('would')).toBe(true);
    expect(STOP_WORDS.size).toBeGreaterThanOrEqual(30);
  });
});

describe('countFrequencies', () => {
  it('counts token occurrences', () => {
    expect(countFrequencies(['hello', 'world', 'hello', 'hello']))
      .toEqual({ hello: 3, world: 1 });
  });

  it('returns empty object for empty array', () => {
    expect(countFrequencies([])).toEqual({});
  });

  it('counts single occurrence', () => {
    expect(countFrequencies(['unique'])).toEqual({ unique: 1 });
  });

  it('handles many unique tokens', () => {
    const freq = countFrequencies(['alpha', 'beta', 'gamma', 'delta']);
    expect(Object.keys(freq)).toHaveLength(4);
    expect(Object.values(freq).every(v => v === 1)).toBe(true);
  });
});
