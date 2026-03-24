import { parentPort } from 'node:worker_threads';
import * as https from 'node:https';
import * as http from 'node:http';
import * as zlib from 'node:zlib';
import type { CrawlScope } from './crawlScope.js';

interface WorkerInput {
  url: string;
  origin: string;
  depth: number;
  crawlScope?: CrawlScope;
}

type RedirectPolicy =
  | { kind: 'unrestricted' }
  | { kind: 'registrableDomain'; baseDomain: string }
  | { kind: 'hostname'; hostname: string };

interface WorkerOutput {
  url: string;
  origin: string;
  depth: number;
  links: string[];
  words: Record<string, number>;
  error: string | null;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'it', 'in', 'on', 'at', 'to', 'of', 'and', 'or', 'but',
  'for', 'with', 'from', 'this', 'that', 'are', 'was', 'be', 'as', 'by', 'we',
  'he', 'she', 'they', 'do', 'not', 'have', 'has', 'had', 'will', 'would', 'can',
  'could', 'should', 'may', 'might', 'its', 'our', 'your', 'their', 'been'
]);

function getBaseDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split('.');
  if (parts.length <= 2) return parts.join('.');
  return parts.slice(-2).join('.');
}

function fetchUrl(
  urlStr: string,
  redirectsLeft = 10,
  policy: RedirectPolicy,
): Promise<{ body: string; contentType: string; finalUrl: string }> {
  return new Promise((resolve, reject) => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlStr);
    } catch {
      reject(new Error(`Invalid URL: ${urlStr}`));
      return;
    }

    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.request(
      parsedUrl,
      {
        headers: {
          'User-Agent': 'WebCrawlerBot/1.0',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept': 'text/html,application/xhtml+xml,*/*'
        },
        rejectUnauthorized: false
      },
      (res) => {
        const statusCode = res.statusCode ?? 0;

        if ([301, 302, 303, 307, 308].includes(statusCode) && res.headers.location) {
          if (redirectsLeft <= 0) {
            reject(new Error('Too many redirects'));
            return;
          }
          const nextUrl = new URL(res.headers.location, urlStr).toString();
          const nextHost = new URL(nextUrl).hostname.toLowerCase();
          if (policy.kind === 'unrestricted') {
            // allow any host
          } else if (policy.kind === 'registrableDomain') {
            if (getBaseDomain(nextHost) !== policy.baseDomain) {
              res.resume();
              reject(new Error(`Redirect to different domain blocked: ${nextUrl}`));
              return;
            }
          } else if (nextHost !== policy.hostname) {
            res.resume();
            reject(new Error(`Redirect to different domain blocked: ${nextUrl}`));
            return;
          }
          res.resume();
          fetchUrl(nextUrl, redirectsLeft - 1, policy).then(resolve, reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          res.resume();
          reject(new Error(`HTTP ${statusCode}`));
          return;
        }

        const encoding = res.headers['content-encoding'];
        let stream: NodeJS.ReadableStream = res;
        if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());
        else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());

        const contentType = res.headers['content-type'] ?? '';
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          resolve({ body, contentType, finalUrl: urlStr });
        });
        stream.on('error', reject);
      }
    );

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.on('error', reject);
    req.end();
  });
}

function extractLinks(html: string, baseUrl: string): string[] {
  const regex = /<a[^>]+href=["']([^"']+)["']/gi;
  const links: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], baseUrl).toString();
      links.push(resolved);
    } catch {
      // skip invalid URLs
    }
  }

  return links;
}

function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
}

function countFrequencies(tokens: string[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const token of tokens) {
    freq[token] = (freq[token] ?? 0) + 1;
  }
  return freq;
}

function redirectPolicyFor(input: WorkerInput): RedirectPolicy {
  const scope = input.crawlScope ?? 'registrableDomain';
  const first = new URL(input.url);
  if (scope === 'unrestricted') return { kind: 'unrestricted' };
  if (scope === 'hostname') {
    return { kind: 'hostname', hostname: first.hostname.toLowerCase() };
  }
  return { kind: 'registrableDomain', baseDomain: getBaseDomain(first.hostname) };
}

async function processUrl(input: WorkerInput): Promise<WorkerOutput> {
  const { body, contentType, finalUrl } = await fetchUrl(input.url, 10, redirectPolicyFor(input));

  if (!contentType.includes('text/html')) {
    return { url: finalUrl, origin: input.origin, depth: input.depth, links: [], words: {}, error: null };
  }

  const links = extractLinks(body, finalUrl);
  const text = extractText(body);
  const tokens = tokenize(text);
  const words = countFrequencies(tokens);

  return { url: finalUrl, origin: input.origin, depth: input.depth, links, words, error: null };
}

parentPort!.on('message', async (input: WorkerInput) => {
  try {
    const output = await processUrl(input);
    parentPort!.postMessage(output);
  } catch (err) {
    parentPort!.postMessage({
      url: input.url,
      origin: input.origin,
      depth: input.depth,
      links: [],
      words: {},
      error: String(err)
    });
  }
});
