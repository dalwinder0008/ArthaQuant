import type { IncomingMessage, ServerResponse } from 'node:http';
import { getNewsSentiment } from '../server.ts';

type ApiRequest = IncomingMessage;
type ApiResponse = ServerResponse<IncomingMessage>;

export default async function handler(_req: ApiRequest, res: ApiResponse): Promise<void> {
  if (_req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const payload = await getNewsSentiment();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(payload));
  } catch (error) {
    console.error('News sentiment API failed:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Unable to load news sentiment.' }));
  }
}
