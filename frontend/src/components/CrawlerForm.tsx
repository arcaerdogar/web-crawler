import { useState } from 'react';
import { startCrawl } from '../api/client.ts';

interface Props {
  onJobStarted: (jobId: string) => void;
}

export function CrawlerForm({ onJobStarted }: Props) {
  const [url, setUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(2);
  const [rateLimit, setRateLimit] = useState(5);
  const [maxQueueSize, setMaxQueueSize] = useState(1000);
  const [workerCount, setWorkerCount] = useState(4);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const { jobId } = await startCrawl({ url, maxDepth, rateLimit, maxQueueSize, workerCount });
      onJobStarted(jobId);
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

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="maxDepth">Max Depth (1-10)</label>
          <input
            id="maxDepth"
            type="number"
            min={1}
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
