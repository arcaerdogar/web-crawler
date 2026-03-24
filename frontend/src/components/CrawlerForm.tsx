import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startCrawl } from '../api/client.ts';
import type { CrawlJob, CrawlScope } from '../types.ts';

const SCOPE_OPTIONS: { value: CrawlScope; label: string; hint: string }[] = [
  {
    value: 'hostname',
    label: 'Yalnızca bu sunucu adı (hostname)',
    hint: 'Örn. yalnızca www.example.com — blog.example.com veya example.com dahil edilmez.',
  },
  {
    value: 'registrableDomain',
    label: 'Aynı kök domain (alt alan adları dahil)',
    hint: 'example.com, www ve blog aynı “kök” altında ise hepsi taranır (mevcut varsayılan).',
  },
  {
    value: 'unrestricted',
    label: 'Kısıtsız (tüm http/https linkler)',
    hint: 'Sayfadaki harici sitelere giden linkler de kuyruğa alınır; derinlik ve kuyruk sınırları geçerlidir.',
  },
];

export function CrawlerForm() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(2);
  const [rateLimit, setRateLimit] = useState(5);
  const [maxQueueSize, setMaxQueueSize] = useState(1000);
  const [workerCount, setWorkerCount] = useState(4);
  const [crawlScope, setCrawlScope] = useState<CrawlScope>('registrableDomain');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const { jobId } = await startCrawl({
        url,
        maxDepth,
        rateLimit,
        maxQueueSize,
        workerCount,
        crawlScope,
      });
      const now = Date.now();
      const seedJob: CrawlJob = {
        jobId,
        originUrl: url,
        maxDepth,
        crawlScope,
        status: 'running',
        pagesCrawled: 0,
        pagesQueued: 0,
        createdAt: now,
        finishedAt: null,
        isActive: true,
      };
      navigate(`/jobs/${jobId}`, { state: { seedJob } });
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="crawler-form" onSubmit={handleSubmit}>
      <h2>Start New Crawl</h2>

      <div className="form-group">
        <label htmlFor="url">Start URL</label>
        <input
          id="url"
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://example.com"
          required
        />
      </div>

      <fieldset className="form-fieldset">
        <legend className="form-legend">Tarama kapsamı</legend>
        {SCOPE_OPTIONS.map(opt => (
          <label key={opt.value} className="form-radio-row">
            <input
              type="radio"
              name="crawlScope"
              value={opt.value}
              checked={crawlScope === opt.value}
              onChange={() => setCrawlScope(opt.value)}
            />
            <span className="form-radio-body">
              <span className="form-radio-label">{opt.label}</span>
              <span className="form-hint">{opt.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="maxDepth">Max Depth (0-10)</label>
          <input
            id="maxDepth"
            type="number"
            min={0}
            max={10}
            value={maxDepth}
            onChange={e => setMaxDepth(Number(e.target.value))}
          />
        </div>

        <div className="form-group">
          <label htmlFor="rateLimit">Rate Limit (1-20 req/s)</label>
          <input
            id="rateLimit"
            type="number"
            min={1}
            max={20}
            value={rateLimit}
            onChange={e => setRateLimit(Number(e.target.value))}
          />
        </div>

        <div className="form-group">
          <label htmlFor="maxQueueSize">Max Queue (100-5000)</label>
          <input
            id="maxQueueSize"
            type="number"
            min={100}
            max={5000}
            step={100}
            value={maxQueueSize}
            onChange={e => setMaxQueueSize(Number(e.target.value))}
          />
        </div>

        <div className="form-group">
          <label htmlFor="workerCount">Workers (1-8)</label>
          <input
            id="workerCount"
            type="number"
            min={1}
            max={8}
            value={workerCount}
            onChange={e => setWorkerCount(Number(e.target.value))}
          />
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <button type="submit" disabled={submitting} className="btn btn-primary">
        {submitting ? 'Starting...' : 'Start Crawl'}
      </button>
    </form>
  );
}
