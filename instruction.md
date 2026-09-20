Role: Senior Quantitative Developer and MLOps Engineer.
Task: Build a modular, production-ready Algorithmic Trading Bot using Python 3.10+ and the modern `alpaca-py` SDK.

Strict Coding Standards:
1. NEVER use the deprecated `alpaca-trade-api` library. Use exclusively `alpaca.trading.client` and `alpaca.data.historical`.
2. All functions must use strict Python Type Hinting.
3. Every API call must be wrapped in robust try-except blocks with explicit logging. Do not let exceptions pass silently.
4. Absolute ban on placeholder code, `# TODOs`, or truncated code blocks. Write the complete, production-grade logic.
5. All market data timestamps must handle timezones explicitly using `zoneinfo` (Target: America/New_York).