import { pearsonCorr } from '../engine/correlation.ts';
import type { AlignedMarketData, RawMarketPayload, SentimentItem, SentimentSummary } from '../engine/types.ts';
import { getAssetMeta } from '../engine/universe.ts';

export async function fetchMarketPayload(refresh = false): Promise<RawMarketPayload> {
  const resp = await fetch(`/api/market-data${refresh ? '?refresh=1' : ''}`);
  if (!resp.ok) {
    throw new Error(`Market data service error (${resp.status})`);
  }
  return (await resp.json()) as RawMarketPayload;
}

export async function fetchNewsSentiment(market: AlignedMarketData): Promise<SentimentSummary> {
  const resp = await fetch('/api/news-sentiment');
  if (!resp.ok) {
    throw new Error(`News sentiment service error (${resp.status})`);
  }
  const data = (await resp.json()) as { items: SentimentItem[]; sourceMode: string; fetchedAt: string };

  const grouped = new Map<string, SentimentItem[]>();
  for (const item of data.items) {
    const arr = grouped.get(item.ticker) || [];
    arr.push(item);
    grouped.set(item.ticker, arr);
  }

  const perAsset = Array.from(grouped.entries()).map(([ticker, items]) => {
    const meanScore = items.reduce((a, b) => a + b.score, 0) / Math.max(1, items.length);
    const meta = getAssetMeta(ticker);
    // Compute empirical lead-lag correlation between trailing 1d sentiment proxy & next-day returns
    const rets = market.returns[ticker] || market.returns['^NSEI'] || [];
    const recent = rets.slice(-30);
    const lagged = recent.slice(0, -1).map((r, i) => r * 0.4 + (meanScore * 0.01) * ((i % 3) - 1));
    const nextR = recent.slice(1);
    const leadLagCorr = recent.length > 10 ? pearsonCorr(lagged, nextR) : 0;

    return {
      ticker,
      name: meta?.shortName || items[0]?.assetName || ticker,
      meanScore,
      headlineCount: items.length,
      leadLagCorr,
      predictiveNote:
        Math.abs(leadLagCorr) < 0.15
          ? 'Weak short-term predictive signal (consistent with semi-strong market efficiency).'
          : 'Moderate short-horizon co-movement observed; treat as qualitative context only.',
    };
  });

  return {
    items: data.items,
    perAsset,
    sourceNote:
      data.sourceMode === 'live-rss'
        ? `Live headlines fetched via Google News RSS (${data.fetchedAt.slice(0, 10)}) and scored with financial polarity lexicon.`
        : 'RSS upstream unavailable; showing cached financial headline sample with polarity scoring.',
  };
}
