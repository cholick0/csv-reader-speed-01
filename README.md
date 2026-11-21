[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/cholick0/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/cholick0/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# csv-reader-speed-01

A faster drop-in for make.fun's csv-reader 1.0.0: `solve.js` returns exactly
what csv-reader returns for every `{text, header}` input (`{columns, rows,
errors}`, including its broken-row error semantics), but several times faster.

How: a single left-to-right scan that slices field values out of the input
instead of building them a character at a time — a tight `charCodeAt` loop for
unquoted fields, `indexOf` jumps for quoted fields, segments joined only when
a field needs repair (doubled quotes, CR normalisation, stray CRs).

Entry for the make.fun bounty "Read broken CSV files faster, 21 November
2026" — https://make.fun/bounty/csv-reader-speed-01-run-20261121
