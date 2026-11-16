import type { AssetClass, Holding } from '../engine/types.ts';
import { INVESTABLE_ASSETS } from '../engine/universe.ts';

export interface ExtractedTradeCandidate {
  tempId: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  currency: 'INR' | 'USD';
  quantity: number;
  buyPrice: number; // INR cost basis per unit
  buyDate: string; // YYYY-MM-DD
  broker: string;
  sourceType: 'gmail' | 'csv';
  sourceSubject: string;
  isSupportedInUniverse: boolean;
  alreadyExists: boolean;
  selected: boolean;
  notes: string;
}

export interface GmailScanResult {
  scannedMessages: number;
  encryptedContractNotesCount: number;
  trades: ExtractedTradeCandidate[];
  queryUsed: string;
}

export class GmailAuthExpiredError extends Error {
  constructor(message = 'Gmail access token expired or missing. Please reconnect Google.') {
    super(message);
    this.name = 'GmailAuthExpiredError';
  }
}

interface AliasEntry {
  ticker: string;
  patterns: string[];
}

const ASSET_ALIASES: AliasEntry[] = [
  { ticker: 'RELIANCE.NS', patterns: ['RELIANCE INDUSTRIES', 'RELIANCE', 'RELIANCE.NS', 'INE002A01018'] },
  { ticker: 'TCS.NS', patterns: ['TATA CONSULTANCY', 'TCS', 'TCS.NS', 'INE467B01029'] },
  { ticker: 'HDFCBANK.NS', patterns: ['HDFC BANK', 'HDFCBANK', 'HDFCBANK.NS', 'INE040A01034'] },
  { ticker: 'INFY.NS', patterns: ['INFOSYS', 'INFY', 'INFY.NS', 'INE009A01021'] },
  { ticker: 'ICICIBANK.NS', patterns: ['ICICI BANK', 'ICICIBANK', 'ICICIBANK.NS', 'INE090A01021'] },
  { ticker: 'ITC.NS', patterns: ['ITC LTD', 'ITC LIMITED', 'ITC.NS', 'INE154A01025'] },
  { ticker: 'LT.NS', patterns: ['LARSEN & TOUBRO', 'LARSEN AND TOUBRO', 'L&T', 'LT.NS', 'INE018A01030'] },
  { ticker: 'GOLDBEES.NS', patterns: ['GOLD BEES', 'GOLDBEES', 'NIPPON INDIA ETF GOLD', 'GOLDBEES.NS', 'INF204KB17I5'] },
  { ticker: 'SILVERBEES.NS', patterns: ['SILVER BEES', 'SILVERBEES', 'NIPPON INDIA SILVER', 'SILVERBEES.NS'] },
  { ticker: 'EMBASSY.NS', patterns: ['EMBASSY OFFICE PARKS', 'EMBASSY REIT', 'EMBASSY', 'EMBASSY.NS'] },
  { ticker: 'MINDSPACE.NS', patterns: ['MINDSPACE BUSINESS', 'MINDSPACE REIT', 'MINDSPACE', 'MINDSPACE.NS'] },
  { ticker: 'LIQUIDBEES.NS', patterns: ['LIQUID BEES', 'LIQUIDBEES', 'NIPPON INDIA ETF LIQUID', 'LIQUIDBEES.NS'] },
  { ticker: 'BTC-USD', patterns: ['BITCOIN', 'BTC-USD', 'BTC/INR', 'BTC/USDT', 'BTC'] },
  { ticker: 'ETH-USD', patterns: ['ETHEREUM', 'ETH-USD', 'ETH/INR', 'ETH/USDT', 'ETH'] },
  { ticker: 'SOL-USD', patterns: ['SOLANA', 'SOL-USD', 'SOL/INR', 'SOL/USDT'] },
  { ticker: 'BNB-USD', patterns: ['BINANCE COIN', 'BNB-USD', 'BNB/INR', 'BNB/USDT'] },
  { ticker: 'GC=F', patterns: ['GOLD FUTURES', 'COMEX GOLD', 'GC=F'] },
];

export function resolveAssetFromLabel(rawLabel: string): {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  currency: 'INR' | 'USD';
  isSupportedInUniverse: boolean;
} {
  const cleaned = rawLabel
    .replace(/\b(EQ|BE|NSE|BSE|LTD|LIMITED|SHARES|STOCK|ETF)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const upper = rawLabel.trim().toUpperCase();

  for (const entry of ASSET_ALIASES) {
    const matched = entry.patterns.some((p) => {
      if (p.length <= 3) {
        return new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(upper);
      }
      return upper.includes(p);
    });
    if (matched) {
      const meta = INVESTABLE_ASSETS.find((a) => a.ticker === entry.ticker);
      if (meta) {
        return {
          ticker: meta.ticker,
          name: meta.name,
          assetClass: meta.assetClass,
          currency: meta.currency,
          isSupportedInUniverse: true,
        };
      }
    }
  }

  // Exact match against INVESTABLE_ASSETS by ticker or stripped ticker
  const directMeta = INVESTABLE_ASSETS.find(
    (a) => a.ticker.toUpperCase() === upper || a.shortName.toUpperCase() === upper
  );
  if (directMeta) {
    return {
      ticker: directMeta.ticker,
      name: directMeta.name,
      assetClass: directMeta.assetClass,
      currency: directMeta.currency,
      isSupportedInUniverse: true,
    };
  }

  // Custom security outside curated universe (e.g. ZOMATO.NS, SBIN.NS)
  const symbolToken = upper.replace(/[^A-Z0-9.\-=^]/g, '');
  const guessedTicker =
    symbolToken.includes('.') || symbolToken.includes('-') || symbolToken.includes('=')
      ? symbolToken.slice(0, 32)
      : `${symbolToken.slice(0, 20) || 'EQUITY'}.NS`;

  const isCrypto = /\b(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|MATIC|POL|AVAX)\b/.test(upper);
  return {
    ticker: guessedTicker,
    name: (cleaned || guessedTicker).slice(0, 100),
    assetClass: isCrypto ? 'Crypto' : 'Equity',
    currency: isCrypto ? 'USD' : 'INR',
    isSupportedInUniverse: false,
  };
}

function decodeBase64UrlUtf8(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

interface GmailPart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

function extractTextFromPayload(payload?: GmailPart): { text: string; hasPdfAttachment: boolean } {
  let plainParts: string[] = [];
  let htmlParts: string[] = [];
  let hasPdfAttachment = false;

  const walk = (part?: GmailPart) => {
    if (!part) return;
    if (part.filename && part.filename.toLowerCase().endsWith('.pdf')) {
      hasPdfAttachment = true;
    }
    if (part.mimeType === 'application/pdf') {
      hasPdfAttachment = true;
    }
    if (part.body?.data) {
      const decoded = decodeBase64UrlUtf8(part.body.data);
      if (part.mimeType === 'text/plain') {
        plainParts.push(decoded);
      } else if (part.mimeType === 'text/html') {
        htmlParts.push(decoded);
      }
    }
    if (Array.isArray(part.parts)) {
      part.parts.forEach(walk);
    }
  };

  walk(payload);

  const stripHtml = (html: string) =>
    html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<\/td>/gi, ' | ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&#8377;|&rupee;/gi, '₹')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();

  const text =
    plainParts.length > 0
      ? plainParts.join('\n')
      : htmlParts.map(stripHtml).join('\n');

  return { text, hasPdfAttachment };
}

function detectBrokerName(fromHeader: string, subject: string, body: string): string {
  const haystack = `${fromHeader} ${subject} ${body.slice(0, 600)}`.toLowerCase();
  if (haystack.includes('groww')) return 'Groww';
  if (haystack.includes('zerodha') || haystack.includes('kite')) return 'Zerodha';
  if (haystack.includes('upstox')) return 'Upstox';
  if (haystack.includes('angelone') || haystack.includes('angel broking')) return 'Angel One';
  if (haystack.includes('coindcx')) return 'CoinDCX';
  if (haystack.includes('coinswitch')) return 'CoinSwitch';
  if (haystack.includes('cdsl')) return 'CDSL';
  if (haystack.includes('nse')) return 'NSE';
  if (haystack.includes('icicidirect')) return 'ICICI Direct';
  if (haystack.includes('hdfcsec')) return 'HDFC Securities';
  return 'Broker Email';
}

function normalizeDateStr(raw: string | undefined, fallbackIso: string): string {
  if (!raw) return fallbackIso;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return fallbackIso;
}

function parseNumber(raw?: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[₹,\s]/g, '');
  const val = parseFloat(cleaned);
  return Number.isFinite(val) && val > 0 ? val : null;
}

function isDuplicateHolding(
  candidate: { ticker: string; quantity: number; buyDate: string },
  existingHoldings: Holding[]
): boolean {
  return existingHoldings.some(
    (h) =>
      h.ticker.toUpperCase() === candidate.ticker.toUpperCase() &&
      Math.abs(h.quantity - candidate.quantity) < 0.001 &&
      h.buyDate === candidate.buyDate
  );
}

/**
 * Extracts one or more BUY trade candidates from an email body + subject.
 */
export function parseTradesFromEmailContent(params: {
  messageId: string;
  from: string;
  subject: string;
  internalDateMs?: string;
  bodyText: string;
  existingHoldings: Holding[];
}): ExtractedTradeCandidate[] {
  const { messageId, from, subject, internalDateMs, bodyText, existingHoldings } = params;
  const fallbackDate = internalDateMs
    ? new Date(Number(internalDateMs)).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const broker = detectBrokerName(from, subject, bodyText);
  const fullText = `${subject}\n${bodyText}`;

  // Skip explicit sell-only notifications
  const hasBuySignal = /\b(buy|bought|purchase|purchased|allotment|allotted|credit(?:ed)?|order\s+executed)\b/i.test(
    fullText
  );
  if (!hasBuySignal) return [];

  const found: ExtractedTradeCandidate[] = [];
  const seenKeys = new Set<string>();

  const pushCandidate = (
    rawSymbol: string,
    qty: number,
    price: number,
    dateStr: string
  ) => {
    const resolved = resolveAssetFromLabel(rawSymbol);
    const key = `${resolved.ticker}|${qty}|${price}|${dateStr}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    const alreadyExists = isDuplicateHolding(
      { ticker: resolved.ticker, quantity: qty, buyDate: dateStr },
      existingHoldings
    );

    found.push({
      tempId: `gm_${messageId}_${found.length}`,
      ticker: resolved.ticker,
      name: resolved.name,
      assetClass: resolved.assetClass,
      currency: resolved.currency,
      quantity: qty,
      buyPrice: price,
      buyDate: dateStr,
      broker,
      sourceType: 'gmail',
      sourceSubject: subject.slice(0, 80),
      isSupportedInUniverse: resolved.isSupportedInUniverse,
      alreadyExists,
      selected: !alreadyExists,
      notes: `Imported from ${broker} email (${subject.slice(0, 60)})`,
    });
  };

  // Pattern 1: Structured inline/table lines e.g.
  // "BUY RELIANCE 10 @ ₹2,450.50" or "Bought 15 shares of TCS at Rs. 3,820.00"
  const lines = fullText.split(/\r?\n/);
  for (const line of lines) {
    // e.g. "Bought 10 shares of Reliance Industries at ₹2,850.00 on 14-05-2025"
    const mNarrative = line.match(
      /\b(?:bought|purchased|buy|allotted)\s+([\d,]+(?:\.\d+)?)\s+(?:shares?|units?|qty|quantity|coins?)?\s*(?:of\s+)?([A-Za-z0-9&.\-\s]{2,40}?)\s+(?:at|@|for|price)\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d+)?)/i
    );
    if (mNarrative) {
      const qty = parseNumber(mNarrative[1]);
      const price = parseNumber(mNarrative[3]);
      const dateMatch = line.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}[/\-]\d{1,2}[/\-]\d{4})/);
      if (qty && price) {
        pushCandidate(
          mNarrative[2],
          qty,
          price,
          normalizeDateStr(dateMatch?.[1], fallbackDate)
        );
      }
      continue;
    }

    // e.g. "RELIANCE | BUY | 10 | 2850.00" or "TCS.NS BUY Qty: 5 Price: ₹3600"
    const mRow = line.match(
      /\b([A-Z][A-Z0-9&.\-\s]{1,28})\s*(?:\||,|\s)+\s*(?:BUY|PURCHASE)\b.*?([\d,]+(?:\.\d+)?)\s*(?:\||@|at|Rs\.?|INR|₹)\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d+)?)/i
    );
    if (mRow) {
      const qty = parseNumber(mRow[2]);
      const price = parseNumber(mRow[3]);
      const dateMatch = line.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}[/\-]\d{1,2}[/\-]\d{4})/);
      if (qty && price) {
        pushCandidate(
          mRow[1],
          qty,
          price,
          normalizeDateStr(dateMatch?.[1], fallbackDate)
        );
      }
    }
  }

  // Pattern 2: Key-value block across email body
  // Stock/Symbol: ... \n Qty/Quantity: ... \n Price/Avg Price: ...
  if (found.length === 0) {
    const symbolMatch = fullText.match(
      /(?:Stock|Scrip|Security|Symbol|Instrument|Asset|Coin)\s*(?:Name)?\s*[:\-]\s*([A-Za-z0-9&.\-\s()]{2,50})/i
    );
    const qtyMatch = fullText.match(
      /(?:Quantity|Qty|Units|Shares)\s*[:\-]\s*([\d,]+(?:\.\d+)?)/i
    );
    const priceMatch = fullText.match(
      /(?:Avg\.?\s*Price|Execution\s*Price|Buy\s*Price|Trade\s*Price|Price|Rate)\s*[:\-]\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d+)?)/i
    );
    const dateMatch = fullText.match(
      /(?:Trade\s*Date|Order\s*Date|Execution\s*Date|Date)\s*[:\-]\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/\-]\d{1,2}[/\-]\d{4}|[A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/i
    );

    if (symbolMatch && qtyMatch && priceMatch) {
      const qty = parseNumber(qtyMatch[1]);
      const price = parseNumber(priceMatch[1]);
      if (qty && price) {
        pushCandidate(
          symbolMatch[1],
          qty,
          price,
          normalizeDateStr(dateMatch?.[1], fallbackDate)
        );
      }
    }
  }

  return found;
}

export async function scanGmailForTrades(
  accessToken: string,
  existingHoldings: Holding[]
): Promise<GmailScanResult> {
  const queryUsed =
    '(from:(groww.in OR zerodha.com OR upstox.com OR angelone.in OR cdslindia.com OR nse.co.in OR bseindia.com OR coindcx.com OR coinswitch.co OR icicidirect.com OR hdfcsec.com) OR subject:("order executed" OR "trade confirmation" OR "contract note" OR "buy order" OR "stock purchased" OR "allotment")) (buy OR bought OR purchase OR purchased OR executed OR qty OR quantity OR shares OR units)';

  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${encodeURIComponent(
    queryUsed
  )}`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (listRes.status === 401 || listRes.status === 403) {
    throw new GmailAuthExpiredError();
  }
  if (!listRes.ok) {
    const errText = await listRes.text();
    throw new Error(`Gmail message list failed (${listRes.status}): ${errText.slice(0, 160)}`);
  }

  const listJson = (await listRes.json()) as { messages?: Array<{ id: string }> };
  const messageIds = (listJson.messages || []).map((m) => m.id).slice(0, 20);

  if (messageIds.length === 0) {
    return {
      scannedMessages: 0,
      encryptedContractNotesCount: 0,
      trades: [],
      queryUsed,
    };
  }

  const allTrades: ExtractedTradeCandidate[] = [];
  let encryptedContractNotesCount = 0;

  const details = await Promise.all(
    messageIds.map(async (id) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (msgRes.status === 401 || msgRes.status === 403) {
        throw new GmailAuthExpiredError();
      }
      if (!msgRes.ok) return null;
      return msgRes.json();
    })
  );

  for (const msg of details) {
    if (!msg) continue;
    const headers: Array<{ name: string; value: string }> = msg.payload?.headers || [];
    const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || '(No Subject)';
    const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value || '';

    const { text, hasPdfAttachment } = extractTextFromPayload(msg.payload);
    const parsed = parseTradesFromEmailContent({
      messageId: msg.id,
      from,
      subject,
      internalDateMs: msg.internalDate,
      bodyText: `${text}\n${msg.snippet || ''}`,
      existingHoldings,
    });

    if (parsed.length === 0 && hasPdfAttachment) {
      encryptedContractNotesCount++;
    } else {
      allTrades.push(...parsed);
    }
  }

  return {
    scannedMessages: messageIds.length,
    encryptedContractNotesCount,
    trades: allTrades,
    queryUsed,
  };
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parses Groww / Zerodha / Upstox / generic CSV holdings or tradebook files into reviewable candidates.
 */
export function parseBrokerCsvTrades(
  csvText: string,
  fileName: string,
  existingHoldings: Holding[]
): ExtractedTradeCandidate[] {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('CSV file must include a header row and at least one trade or holding row.');
  }

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, '_'));

  const findCol = (candidates: string[]): number =>
    headers.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));

  const symbolIdx = findCol(['tradingsymbol', 'symbol', 'ticker', 'stock_name', 'instrument', 'scrip', 'name']);
  const qtyIdx = findCol(['quantity', 'qty', 'net_qty', 'units', 'shares']);
  const priceIdx = findCol(['average_price', 'avg_buy_price', 'buy_price', 'price', 'rate', 'cost_per_unit']);
  const dateIdx = findCol(['trade_date', 'buy_date', 'order_execution_time', 'execution_date', 'date']);
  const sideIdx = findCol(['trade_type', 'transaction_type', 'type', 'side']);

  if (symbolIdx === -1 || qtyIdx === -1 || priceIdx === -1) {
    throw new Error(
      'Could not find Symbol/Stock, Quantity, and Price columns. Supported formats: Zerodha Tradebook/Holdings, Groww Statement, or ticker,quantity,buyPrice,buyDate.'
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const broker = fileName.toLowerCase().includes('zerodha') || fileName.toLowerCase().includes('tradebook')
    ? 'Zerodha CSV'
    : fileName.toLowerCase().includes('groww')
    ? 'Groww CSV'
    : 'Broker CSV';

  const out: ExtractedTradeCandidate[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 3) continue;

    if (sideIdx !== -1) {
      const side = (cols[sideIdx] || '').trim().toLowerCase();
      if (side && side !== 'buy' && side !== 'b' && side !== 'purchase') {
        continue; // Skip sell rows
      }
    }

    const rawSymbol = cols[symbolIdx];
    const qty = parseNumber(cols[qtyIdx]);
    const price = parseNumber(cols[priceIdx]);
    if (!rawSymbol || !qty || !price) continue;

    const rawDate = dateIdx !== -1 ? (cols[dateIdx] || '').split('T')[0].split(' ')[0] : undefined;
    const buyDate = normalizeDateStr(rawDate, todayIso);
    const resolved = resolveAssetFromLabel(rawSymbol);
    const alreadyExists = isDuplicateHolding(
      { ticker: resolved.ticker, quantity: qty, buyDate },
      existingHoldings
    );

    out.push({
      tempId: `csv_${i}_${resolved.ticker}`,
      ticker: resolved.ticker,
      name: resolved.name,
      assetClass: resolved.assetClass,
      currency: resolved.currency,
      quantity: qty,
      buyPrice: price,
      buyDate,
      broker,
      sourceType: 'csv',
      sourceSubject: fileName.slice(0, 60),
      isSupportedInUniverse: resolved.isSupportedInUniverse,
      alreadyExists,
      selected: !alreadyExists,
      notes: `Imported via ${broker} (${fileName.slice(0, 48)})`,
    });
  }

  return out;
}
