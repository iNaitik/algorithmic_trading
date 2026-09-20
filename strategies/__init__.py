"""
strategies/ — Plug-and-Play Strategy Registry
===============================================
Drop a new .py file in this directory, decorate your function with
@strategy, and it will be automatically discovered and available
for backtesting.

Usage in backtesting.py:
    from strategies import get_strategy, list_strategies

Example strategy file (strategies/my_strategy.py):
    from strategies import strategy
    import pandas as pd

    @strategy(name="My Strategy", description="Does cool things")
    def my_strategy(df: pd.DataFrame, **kwargs) -> pd.DataFrame:
        # ... your logic ...
        df['execution_signal'] = df['signal'].shift(1).fillna(0).astype(int)
        return df
"""

from typing import Callable, Dict, List, Optional
import importlib
import pkgutil
import os
import sys

# ── Strategy Registry ────────────────────────────────────────────────────────
_STRATEGY_REGISTRY: Dict[str, Dict] = {}


def strategy(name: str, description: str = "", market: str = "US"):
    """
    Decorator that registers a strategy function into the global registry.

    The decorated function MUST:
        1. Accept a pd.DataFrame with OHLCV columns as its first argument.
        2. Return a pd.DataFrame with an 'execution_signal' column
           (1 = BUY, -1 = SELL, 0 = HOLD).
        3. Shift signals by 1 row to prevent look-ahead bias.

    Parameters
    ----------
    name : str
        Human-readable name for the strategy (used in menus and reports).
    description : str
        Short description of what the strategy does.
    market : str
        The market this strategy applies to (e.g., "US", "INDIA", "ALL").
        Defaults to "US".

    Example
    -------
    @strategy(name="SMA Crossover", description="9/21 SMA crossover system")
    def sma_crossover(df, fast_window=9, slow_window=21):
        ...
        return df
    """
    def decorator(func: Callable) -> Callable:
        _STRATEGY_REGISTRY[name] = {
            'func': func,
            'name': name,
            'description': description,
            'market': market,
            'module': func.__module__,
        }
        func._strategy_name = name
        func._strategy_description = description
        func._strategy_market = market
        return func
    return decorator


def get_strategy(name: str) -> Callable:
    """
    Retrieves a registered strategy function by its name.

    Parameters
    ----------
    name : str
        The exact name the strategy was registered with.

    Returns
    -------
    Callable
        The strategy function.

    Raises
    ------
    KeyError
        If no strategy with that name exists.
    """
    if name not in _STRATEGY_REGISTRY:
        available = ', '.join(_STRATEGY_REGISTRY.keys()) or '(none loaded)'
        raise KeyError(
            f"Strategy '{name}' not found. Available: {available}"
        )
    return _STRATEGY_REGISTRY[name]['func']


def list_strategies() -> List[Dict]:
    """
    Returns a list of all registered strategies with their metadata.

    Returns
    -------
    List[Dict]
        Each dict contains: name, description, module, func.
    """
    return list(_STRATEGY_REGISTRY.values())


def get_registry() -> Dict[str, Dict]:
    """Returns the raw strategy registry dictionary."""
    return _STRATEGY_REGISTRY


# ── Auto-Discovery ───────────────────────────────────────────────────────────
# Automatically imports every .py file in the strategies/ directory so that
# @strategy decorators execute and register themselves on import.

def _auto_discover() -> None:
    """
    Scans the strategies/ package directory recursively and imports all Python
    modules found. This triggers the @strategy decorators to register
    each strategy function into the global registry.
    """
    package_dir: str = os.path.dirname(__file__)

    for module_info in pkgutil.walk_packages([package_dir], prefix="strategies."):
        if module_info.name.split('.')[-1].startswith('_'):
            continue  # skip __init__, __pycache__, etc.
        try:
            importlib.import_module(module_info.name)
        except Exception as e:
            print(f"⚠️  Failed to load strategy module '{module_info.name}': {e}")


# Run auto-discovery when the package is imported
_auto_discover()
