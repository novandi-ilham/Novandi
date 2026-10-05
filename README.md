# ilham novandi trader V43 — Profit Lock Absolute

V43 is based on V42 with one critical risk-control fix:

- Profit Giveback is now **independent of Auto Rotate**.
- If a paper position reaches a positive peak profit and then gives back the configured percentage (default 10%), it closes immediately on the live price update.
- Example: peak +Rp100,000 with 10% giveback closes at or below +Rp90,000.
- After close, the hunter can scan again and re-enter the best available 15M opportunity.
- 15M only; no minimum confidence gate.
- Repeat-loss pair rotation remains enabled.
