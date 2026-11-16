import type { IncomingMessage, ServerResponse } from 'node:http';
import { getMarketData } from '../server.ts';

type ApiRequest = IncomingMessage & { url?: string };
type ApiResponse = ServerResponse<IncomingMessage>;

function sendJson(res: ApiResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const payload = await getMarketData(url.searchParams.get('refresh') === '1');
    sendJson(res, 200, payload);
  } catch (error) {
    console.error('Market data API failed:', error);
    sendJson(res, 500, { error: 'Unable to load market data.' });
  }
}
