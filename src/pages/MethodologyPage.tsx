import React from 'react';

export function MethodologyPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Quantitative Methodology, Data Pipeline & Citations
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          ArthaQuant is designed as an educational decision-support and quantitative risk platform rather than a price-prediction engine. All time-series computations enforce strict temporal causality (walk-forward expanding windows; training scalers fit exclusively on past data).
        </p>

        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">1. Calendar Alignment & FX Translation</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Indian equities trade Monday–Friday excluding NSE holidays, whereas Bitcoin/Ethereum trade 365 days. Cross-asset matrices align onto the NIFTY 50 equity trading calendar, forward-filling up to 3 days and converting USD-quoted series into INR via aligned USDINR=X rates.
            </p>
          </div>

          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">2. Portfolio Variance & Tail Risk</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Portfolio volatility is computed via σ_p = √(w′Σw), never as a naive weighted average of asset volatilities. We compute Historical, Parametric, and 2,500-path Cholesky Monte Carlo 95% VaR alongside Expected Shortfall (CVaR), Sharpe (Rf = 6.5%), Sortino, Calmar, and XIRR (Brent&apos;s root solver on [-0.99, 10]).
            </p>
          </div>

          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">3. Volatility Forecasting & HMM Regimes</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              GARCH(1,1), L2-regularized Gradient Boosted Trees (XGBoost-style), and 30-day gated sequence LSTM models are evaluated across 5 walk-forward folds against Naive (t−1) and Rolling 20-Day baselines using RMSE, MAE, QLIKE, and directional accuracy. Market regimes (Bull, Sideways, Bear) use a 3-state Gaussian HMM selected by BIC with forward-filtered probabilities.
            </p>
          </div>

          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">4. Ledoit-Wolf Optimization & Backtesting</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Mean-variance weights stabilize covariance via Ledoit-Wolf shrinkage and blend Markowitz Max-Sharpe with Risk Parity (Euler equal risk contribution). Regime-aware constraints lower crypto caps and raise gold/liquid floors during Bear regimes. Backtests deduct 0.15% round-trip transaction costs and slippage.
            </p>
          </div>
        </div>
      </div>

      {/* Literature References */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Academic Literature & References</h2>
        <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
          <li>• Markowitz, H. (1952). Portfolio Selection. Journal of Finance, 7(1), 77–91.</li>
          <li>• Sharpe, W. F. (1964). Capital Asset Prices: A Theory of Market Equilibrium under Conditions of Risk. Journal of Finance.</li>
          <li>• Bollerslev, T. (1986). Generalized Autoregressive Conditional Heteroskedasticity (GARCH). Journal of Econometrics.</li>
          <li>• Hamilton, J. D. (1989). A New Approach to the Economic Analysis of Nonstationary Time Series and the Business Cycle (HMM). Econometrica.</li>
          <li>• Hochreiter, S., &amp; Schmidhuber, J. (1997). Long Short-Term Memory (LSTM). Neural Computation.</li>
          <li>• Liu, F. T., Ting, K. M., &amp; Zhou, Z.-H. (2008). Isolation Forest. IEEE ICDM.</li>
          <li>• Maillard, S., Roncalli, T., &amp; Teiletche, J. (2010). The Properties of Equally Weighted Risk Contribution Portfolios (Risk Parity). Journal of Portfolio Management.</li>
          <li>• Araci, D. (2019). FinBERT: Financial Sentiment Analysis with Pre-trained Language Models.</li>
        </ul>
      </div>

      {/* Compliance Disclaimer */}
      <div className="rounded-lg border border-slate-200 bg-slate-100 p-5 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <strong>Regulatory & Educational Disclaimer:</strong> This application was engineered as a B.Tech CSE (AIML) portfolio analytics and quantitative decision-support system. It does not constitute SEBI-registered investment advice, brokerage execution, or tax/legal counsel. Model outputs, backtests, and volatility forecasts rely on historical distributions and assumptions that do not guarantee future performance.
      </div>
    </div>
  );
}
