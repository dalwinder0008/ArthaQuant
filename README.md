# ArthaQuant

ArthaQuant is a multi-asset portfolio analytics and quantitative risk dashboard, with an India-focused asset universe and INR as its reporting currency. It brings holdings, historical market data, risk measurements, portfolio comparisons, and rebalance scenarios into one educational decision-support app.

> **Important:** ArthaQuant is not a broker, does not place trades, and is not investment, tax, or legal advice. Market data and model outputs can be delayed, incomplete, simulated, or wrong. Verify information independently before making financial decisions.

## The problem and the approach

An investor holding Indian equities, ETFs, REITs, gold, cash-like assets, and crypto may have to consult different sources and currencies to understand total exposure. Looking at each asset independently can also hide concentration, correlated losses, and the effect of a changing market regime.

ArthaQuant addresses this by combining holdings and manual real-asset valuations with a shared INR-denominated analytics pipeline. It aligns historical price series, estimates portfolio risk and diversification, compares simple strategies, and presents constrained allocation scenarios and alerts. These are analytical aids—not forecasts or trade instructions.

## What the app includes

- **Overview:** portfolio value, allocation and market context.
- **Portfolio:** add, edit and remove market holdings; record manually valued real estate; import trade data; review holdings and allocation by asset class, currency, or risk bucket.
- **Risk:** return and volatility statistics, drawdowns, VaR/CVaR, beta, risk contributions, and benchmark comparisons.
- **Correlation:** Pearson and Spearman relationships, rolling correlation, diversification measures, and potential hedges.
- **Insights:** volatility-model comparisons, market-regime estimates, and headline sentiment context.
- **Optimizer:** constrained allocation/frontier and rebalancing scenarios, with transaction-cost estimates and backtest comparisons.
- **Alerts:** portfolio concentration, volatility, regime, anomaly, and correlation rule checks.
- **Methodology:** an in-app summary of analytical assumptions and educational limitations.

### Supported market universe

The configured universe includes selected Indian equities (including Reliance, TCS, HDFC Bank, Infosys, ICICI Bank, ITC, and L&T), Gold BeES and Silver BeES, COMEX gold, Bitcoin, Ethereum, Solana, BNB, Embassy and Mindspace REITs, and Liquid BeES. NIFTY 50, Bank NIFTY, India VIX, and USD/INR are used as benchmarks or indicators, not investable assets.

## Data sources and flow

1. The Express server requests up to five years of daily price history from Yahoo Finance's chart endpoint for the configured tickers.
2. The browser requests that data from `/api/market-data`. The analytics engine aligns series to the NIFTY 50 trading calendar, fills short gaps, converts USD-priced series to INR using USD/INR, and computes returns and portfolio metrics.
3. `/api/news-sentiment` fetches selected headlines from Google News RSS. Headline polarity is scored with a small keyword-based financial lexicon; it is **not** an inference from a FinBERT model. Any lead/lag statistic is exploratory context, not a validated prediction.
4. Market responses are cached in memory and in `.cache/market_cache.json` for up to 10 minutes; news responses are cached in memory for up to 15 minutes. A market refresh can be requested with `?refresh=1`.

When upstream price data is unavailable, the server creates a deterministic, calibrated **synthetic** multi-regime price history for the configured universe and marks the response as fallback data. If only some feeds load, the response combines live and fallback series. The app exposes a source mode and stale-data reason; check them before interpreting results. Synthetic fallback prices are for app continuity and demonstration only. They are not historical exchange prices and must not be used as evidence for investment decisions or performance claims.

### Importing and exporting

- **Broker CSV import:** upload a Groww or Zerodha Tradebook/Holdings CSV. Parsed buy positions are shown for review and confirmation before they are added.
- **Gmail import:** optionally grant Google OAuth `gmail.readonly` access to scan recent broker confirmation emails for plain-text buy trades. Candidates require review before import. Password-protected or image-only contract notes are skipped; use a broker CSV for those trades. The access token is kept in memory by the app and is not saved in browser storage.
- **CSV export:** download portfolio holdings and manual real assets with quantities, cost basis, current values, P&L, and weights.
- **PDF export:** download an advisory-style summary with portfolio and risk metrics, holdings, optimizer trades, alerts, and a narrative summary.

Imports and exports do not connect to a broker for order execution.

## Quantitative methods

The calculations are implemented in the TypeScript engine under `src/engine/` and run as application logic; this repository does not include separate Python model services.

- **Portfolio and risk:** annualized return and volatility, covariance-based portfolio variance, Sharpe and Sortino ratios, maximum drawdown, historical and parametric VaR, Cholesky-based Monte Carlo VaR (2,500 paths), CVaR, beta, and risk contributions. Cash-flow XIRR is calculated with a root solver.
- **Correlation and diversification:** Pearson and Spearman correlation, rolling relationships, crisis-period comparisons, and effective number of bets.
- **Volatility comparisons:** naive and 20-day rolling baselines compared with an implemented GARCH(1,1) calculation, an XGBoost-style regularized boosted-stump model, and a compact LSTM-inspired sequence model. The latter two names describe lightweight in-repository implementations, not the use of the XGBoost or TensorFlow/PyTorch libraries. Walk-forward evaluation reports RMSE, MAE, QLIKE, and directional accuracy.
- **Market regimes:** a three-state Bull/Sideways/Bear Gaussian hidden Markov model, with the state count compared using BIC and probabilities forward-filtered.
- **Optimization and backtesting:** covariance shrinkage, constrained mean-variance and risk-parity scenarios, optional regime-aware constraints, and strategy comparisons with modeled transaction costs. A backtest is a historical simulation, not a guarantee of future performance.
- **Anomalies and alerts:** statistical anomaly detection and user-configurable threshold/rule checks for selected portfolio conditions.

These are educational implementations and depend on assumptions and historical samples. The methods page in the app provides additional context and literature references; their presence does not imply that every model uses a corresponding external ML library or has been independently validated.

## Technology

- **UI:** React 19, TypeScript, Vite, Tailwind CSS 4, Motion, and Lucide icons.
- **Server and market endpoints:** Node.js, Express, and `tsx`; Vite middleware serves the app during development.
- **Persistence and authentication:** Firebase Authentication (Google sign-in) and Cloud Firestore.
- **Reports and imports:** jsPDF for PDF reports; browser file APIs for CSV import/export; Google OAuth/Gmail API read scope for optional email import.
- **Tests and checks:** `tsx` test runner and TypeScript compiler.

## Run locally

### Requirements

- Node.js 20.19+ or 22.12+ (required by the configured Vite 8 release).
- [Bun](https://bun.sh/) is recommended because the repository includes `bun.lock`. npm can also be used.
- A configured Firebase project is needed for Google sign-in and cloud-saved user data. Market and fallback data routes run through the local server.

### Install and start development

From the repository root:

```powershell
bun install
bun run dev
```

Or with npm:

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The Express server serves the Vite app and API endpoints on port `3000`.

### Check and build

```powershell
bun run lint
bun run test
bun run build
```

With npm, use `npm run lint`, `npm test`, and `npm run build`. The production frontend is written to `dist/`.

To run the production server on Windows PowerShell after building:

```powershell
$env:NODE_ENV = "production"
bun run dev
```

This starts the same server in production mode, serving `dist/` and the API on port `3000`. Keep the environment variable and command in the same terminal session.

## Firebase and optional Gmail setup

1. Configure the Firebase web app settings in `firebase-applet-config.json` for your Firebase project (including its Firestore database ID).
2. Enable Google as a Firebase Authentication provider and authorize the hostnames where you will run the app.
3. Create or configure the Firestore database, then review and deploy the repository's `firestore.rules` to that project. The rules are intended to restrict profile, holding, manual-asset, and alert data to the authenticated owner. Do not use real user data until the deployed rules have been checked.
4. For Gmail trade import, enable the Gmail API and configure the Google OAuth consent screen/client for the app's origin and requested `gmail.readonly` scope. This permission is optional; CSV import does not require Gmail access.

When a user signs in for the first time, the app creates a Firestore profile and seeds example holdings, a manual real-estate asset, and alert rules. Review or replace these sample records before relying on portfolio totals.

The checked-in Firebase client configuration identifies a project and is not a substitute for Firestore rules or correct Firebase Console setup. Use your own project configuration when deploying your own instance. `.env.example` documents optional hosting/AI Studio variables; the current market, portfolio analytics, and report flows do not require a Gemini API key.

## Repository layout

```text
src/
  components/   Shared charts and account settings
  engine/       Portfolio, risk, optimization, backtest, and reporting logic
  lib/          Firebase authentication and Firestore access
  pages/        Dashboard views
  services/     Market data, news, and trade import integrations
tests/          Engine tests
server.ts       Express API and development/production server
firestore.rules Firestore access-control rules
```

## Disclaimer

This project was built as an educational portfolio analytics and quantitative decision-support system. It does not provide SEBI-registered investment advice, execute orders, or provide tax or legal counsel. External data availability and quality are not guaranteed. Historical performance, synthetic fallback data, sentiment scores, forecasts, optimizers, and backtests do not guarantee future results.
