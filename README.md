# ilham novandi — V56 Pair Loss Movement Guard

V56 keeps the 15M-only Paper Engine and adds a strict pair-loss movement rule:

- Default: 3 meaningful adverse price moves.
- Configurable: 2 or 3 moves.
- A BUY counts a move when price advances meaningfully downward against entry/anchor.
- A SELL counts a move when price advances meaningfully upward against entry/anchor.
- Entry fees/slippage alone never count as a loss movement.
- A meaningful favorable move resets the consecutive adverse-move counter.
- When the counter reaches the configured limit while PnL is negative, the position closes immediately.
- Hard floating loss is an emergency ceiling at 0.20% of account equity by default.
- Existing profit giveback, SL/TP, break-even, trailing, scanner rotation, and 15M-only logic remain.
- Paper storage is versioned to V56 so old V55 paper state is not silently reused.

This is a risk-control mechanism, not a guarantee of profit.
