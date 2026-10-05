# V46 Complete

## Core behavior
- 15M only.
- No minimum confidence gate.
- 5-candle momentum is a comparative ranking feature, not a fixed percentage threshold.
- Best Pair = strongest current profit opportunity among scanned candidates.
- Best-pair switch and entry happen in the same hunter cycle after fresh validation.
- Repeated-loss symbols are cooled down.
- Profit giveback remains 10% of peak profit by default.


## V49 Entry Hunter
Scanner memakai fresh momentum dari candle terbaru sebagai entry confirmation; confidence bukan gerbang entry. Best Pair hanya dipilih dari pair dengan pulse terbaru, dan setelah switch chart divalidasi ulang sebelum entry. Profit giveback 10% tetap diperiksa pada setiap live update.
