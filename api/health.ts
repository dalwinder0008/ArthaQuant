import type { IncomingMessage, ServerResponse } from 'node:http';

type ApiResponse = ServerResponse<IncomingMessage>;

export default function handler(_req: IncomingMessage, res: ApiResponse): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ status: 'ok', service: 'ArthaQuant Market & Quantitative API' }));
}
