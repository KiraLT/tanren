---
name: usda-fdc-bulk-csv
description: USDA FoodData Central DEMO_KEY allows only 10 requests then 429 for ~11 h; verify food values from the SR Legacy CSV bulk zip instead
metadata:
  type: reference
---

USDA FDC API with `DEMO_KEY` returned `x-ratelimit-limit: 10` and a 429 with `retry-after: 39813` after 10 searches (N-F0, 2026-10-27), not the documented 30/h. The SR Legacy bulk dataset needs no key: `https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip` (6 MB). Download it into a `mktemp -d "$S/<task>-XXXX"` dir; `food.csv` (fdc_id, description) + `food_nutrient.csv` (nutrient_id 1008 kcal, 1003 protein, 1005 carbs, 1004 fat, per 100 g).

**How to apply:** any task that must "verify against USDA FDC" — go straight to the CSV, keep the API for one-off spot checks. SR Legacy has no casein powder, no generic protein bar, no creatine.
