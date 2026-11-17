# makefun-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kanashit12/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kanashit12/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar: every protocol DefiLlama tracks that records no token, ranked by what its token would be worth if the protocol's record stayed as it is — with a farm plan for each one. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## The model (radar-2)

Implied value follows only from the sealed snapshot's own figures, priced off the market's own comparables:

```
implied = TVL × multiple × growth × maturity × breadth
multiple   median mcap/TVL of live protocols in the same category (≥3),
           else the median across all live protocols; clamped to [0.02, 1.50]
growth     1 + clamp(change_7d, −50, +100)% × 0.5                 in [0.75, 1.50]
maturity   0.7 + min(age_days, 1095) / 1095 × 0.3                 in [0.70, 1.00]
breadth    1 + 0.02 × min(chains − 1, 5)                          in [1.00, 1.10]
```

The board covers all 40 watchlist protocols plus every other rankable pre-token protocol in the snapshot (198 rows). Live-token protocols are kept apart and shown as the market's own values — they are the comparables the multiples come from. Farm plans (7 steps each, with cost and time) are derived from each protocol's category, chains, TVL and age. No protocol name is ever special-cased.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot, writes the ranked board to `out/board.json`, the dashboard data to `out/data.js`, copies `dashboard/` and `screenshots/` to `out/`, and writes `out/dossier.json`. Run it twice into two directories: the bytes match, run for run. Open `out/dashboard/index.html` in a browser — no network needed.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
