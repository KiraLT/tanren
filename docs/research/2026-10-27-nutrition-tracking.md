# Nutrition tracking practice (plan Amendment 20)

Architect research note, 2026-10-27 (all sources read 2026-10-27 unless marked). `UNVERIFIED` = not
confirmed against a primary source today; treat it as a question for a spike or the owner.

## 1. Tracker calories vs logged workouts

**MyFitnessPal (primary: MFP partner API docs, https://myfitnesspalapi.com/docs/appendix-tracking-calorie-adjustments):**
- MFP's own daily burn estimate = RMR x PAL (the activity level the user chose at signup).
- The "Full Day Projection" = tracker energy measured so far + the RMR still remaining in the day; as the day goes on it leans on measured data. **Adjustment = projection − MFP estimate** (a delta vs the estimated baseline, not the device's active calories and not the total burn).
- If the projection is below the estimate the adjustment is **0** unless the user enabled **negative adjustments**, then it is negative and *lowers* the food budget. MFP staff: the device "is tracking a complete day burn", not individual workouts; the value fluctuates with each sync (https://pol1.lr.ggtyler.dev/r/Myfitnesspal/comments/1ib6y9z/why_does_mfp_add_a_workout — Reddit mirror, staff reply).
- Double counting: a manual exercise entry must carry start time + duration when a tracker is linked; tracker burn inside that window is excluded "for prevention of duplication" (partner docs). Users who log an exercise *without* that window, or whose tracker under-reads, see the step adjustment cancel the workout (e.g. 495 kcal workout − 310 kcal negative adjustment; https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/208311/negative-calorie-adjustment-my-fitness-pal/1506111).

**Others (one line each):**
- **MacroFactor**: deliberately ignores wearable and manual exercise calories; target comes from intake vs weight trend only (https://macrofactor.com/wearables/, https://help.macrofactorapp.com/en/articles/256-i-ve-started-exercising-more-why-isn-t-my-expenditure-increasing).
- **Cronometer**: imports Garmin active calories and adds them to a BMR + activity baseline. `UNVERIFIED` (only forum threads found: https://forums.cronometer.com/discussion/2934/calories-from-garmin).

**Simplest policy for Tanren** (Garmin daily totals + strength logs without calories):
- Budget = **goal intake** (fixed number from §3: maintenance x goal delta), shown with "burned today" (`totalKilocalories`, §2) as *information*, not added to the budget by default. One optional toggle "eat back activity" adds `activeKilocalories − baseline active` floored at 0 (MFP's default, no negative adjustments).
- **Never** add calories for Tanren strength sessions: when the watch is worn they are already inside Garmin's daily total (§2), and without a watch any estimate is a guess. This removes every double-count path.

## 2. Garmin daily summary calorie fields

Source: the spike's OpenAPI dump `.../scratchpad/garmin/spec.json` (title "Garmin Connect Personal API"
1.0.0), endpoint `usersummary-service/usersummary/daily`; descriptions quoted verbatim:

| Field | Type | Spec description |
|---|---|---|
| `totalKilocalories` | double | "Total calories burned for the day, including basal metabolic rate (BMR) and active calories." |
| `activeKilocalories` | double | "Active calories burned while moving throughout the day." |
| `bmrKilocalories` | double | "Basal metabolic rate (BMR) calories burned for the day." |
| `consumedKilocalories` | double | "Calories consumed for the day." (source of the value: Garmin food log or an MFP link, `UNVERIFIED`) |
| `remainingKilocalories` | double | "the user's daily calorie goal minus the calories consumed." |
| `netCalorieGoal` | int32 | "The user's net calorie goal for the day." |
| `wellnessKilocalories` | — | **ABSENT** from the dump (also present there, undocumented: `bmrCalories`, `adjustedCalories`, `autoCalcCalories`, `isAutoCalcCalories`). `UNVERIFIED` live. |

- **"Burned today" for a budget = `totalKilocalories`** (= BMR + active per the spec); use `activeKilocalories` only for an eat-back delta. For *today* the values accrue as the day goes (BMR so far, not a 24 h projection) — `UNVERIFIED`; a spike comparing two pulls 1 h apart settles it.
- **Strength activity with the watch worn**: Garmin computes active calories from heart rate above resting HR all day (community, https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-mobile-ios/312702/garmin-active-calorie-adjustments/1514750), and a recorded activity's calories include its resting portion while the daily figure splits them (https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/115272/active-calories-and-calories-burned-from-activities-don-t-add-up/1220928). So the strength session **is included** in the daily total. Garmin support pages returned 403 to the fetcher; `UNVERIFIED` against official Garmin docs. The spike already saw per-activity `calories` + `bmrCalories` on strength activities (`docs/research/2026-10-27-garmin-personal-api.md`).

## 3. Goal formulas

- **Mifflin-St Jeor** (Mifflin et al., Am J Clin Nutr 1990;51(2):241-7, n = 498, indirect calorimetry): men `10·kg + 6.25·cm − 5·age + 5`; women same `− 161`. Frankenfield et al. (J Am Diet Assoc 2005;105(5):775-89): most reliable of four equations, within 10 % of measured RMR in more people than any other, yet still off > 10 % in roughly a quarter. Read via https://pure.psu.edu/en/publications/comparison-of-predictive-equations-for-resting-metabolic-rate-in-/ and https://agris.fao.org/search/ar/records/65de26fe7c7033e84be9ee76.
- **Activity multipliers** (convention): 1.2 sedentary · 1.375 light (1–3 d/wk) · 1.55 moderate (3–5) · 1.725 very active (6–7) · 1.9 extra (physical job + training). Primary source not found in the box; `UNVERIFIED` attribution. With Garmin connected, a 14-day mean of `totalKilocalories` beats any multiplier.
- **Muscle gain**: +10–20 % over maintenance, target +0.25–0.5 % bodyweight/week for novice/intermediate (Iraki et al. 2019, https://pmc.ncbi.nlm.nih.gov/articles/PMC6680710/). Default **+10 %**.
- **Fat loss**: set intake for −0.5 to −1 % bodyweight/week to keep muscle (Helms et al. 2014, https://jissn.biomedcentral.com/track/pdf/10.1186/1550-2783-11-20). In kcal this is commonly a −15 to −25 % deficit (`UNVERIFIED` as a cited range). Default **−20 %**.
- **Protein**: 1.4–2.0 g/kg/day for most exercising people (ISSN position stand, Jäger et al. 2017, JISSN 14:20, doi 10.1186/s12970-017-0177-8; summary https://www.nutraingredients.com/Article/2017/06/21/ISSN-publishes-position-stand-on-protein-and-exercise/); 2.3–3.1 g/kg **lean** mass in a deficit (Helms 2014, ISSN). Defaults: maintain 1.6, gain 1.8, cut 2.2 g/kg.

## 4. Food data

| Source | Licence / terms | Access | Fit |
|---|---|---|---|
| USDA FoodData Central | **CC0 1.0**; credit requested, no permission needed | free api.data.gov key; **1,000 req/h/IP**, key blocked 1 h on excess; DEMO_KEY 30/h, 50/day (https://fdc.nal.usda.gov/api-guide, https://api.data.gov/docs/developer-manual/) | **best** for the quick-add catalog (bake values in, no runtime calls) and a later Worker-proxied search |
| Open Food Facts | **ODbL**: attribution "(c) Open Food Facts contributors" + link, **share-alike** on a derived DB; custom User-Agent required; **15 req/min/IP product reads, 10 req/min/IP search** (https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/, https://wiki.openfoodfacts.org/ODBL_License) | free, no key | the free **barcode** source; call on demand, do not mirror into D1 (share-alike) |
| Other free barcode DBs | none found in the box | — | `UNVERIFIED` |

No LLM is needed for either (plan: no app LLM calls); estimation by Claude goes through MCP (§5).

**Quick-add values** — typical generic values, from memory of USDA FDC / labels; **`UNVERIFIED` per row**,
an engineer checks each against FDC (Foundation / SR Legacy) before freezing the catalog:

| Item | Portion | kcal | P g | C g | F g |
|---|---|---|---|---|---|
| Whey protein shake (water) | 30 g powder | 120 | 24 | 3 | 1.5 |
| Whey shake with milk | 30 g + 250 ml semi-skimmed | 245 | 32 | 15 | 6 |
| Protein bar | 60 g bar | 220 | 20 | 22 | 7 |
| Egg, whole | 1 large (50 g) | 72 | 6.3 | 0.4 | 4.8 |
| Banana | 1 medium (118 g) | 105 | 1.3 | 27 | 0.4 |
| Apple | 1 medium (182 g) | 95 | 0.5 | 25 | 0.3 |
| Oats, dry | 50 g | 190 | 6.5 | 33 | 3.5 |
| Chicken breast, cooked | 100 g | 165 | 31 | 0 | 3.6 |
| Rice, white, cooked | 100 g | 130 | 2.7 | 28 | 0.3 |
| Pasta, cooked | 100 g | 158 | 5.8 | 31 | 0.9 |
| Potato, boiled | 100 g | 87 | 1.9 | 20 | 0.1 |
| Greek yoghurt 0 % | 150 g | 90 | 15 | 6 | 0 |
| Greek yoghurt 2 % | 150 g | 110 | 15 | 6 | 3 |
| Cottage cheese (low fat) | 100 g | 80 | 11 | 3.5 | 2 |
| Milk, semi-skimmed | 250 ml | 125 | 8.5 | 12 | 4.5 |
| Bread, wholemeal | 1 slice (35 g) | 85 | 4 | 14 | 1 |
| Peanut butter | 1 tbsp (16 g) | 95 | 3.5 | 3.5 | 8 |
| Almonds | 30 g | 175 | 6 | 6 | 15 |
| Salmon, cooked | 100 g | 206 | 22 | 0 | 12 |
| Tuna, canned in water | 100 g drained | 116 | 26 | 0 | 1 |
| Beef mince 5 %, cooked | 100 g | 170 | 26 | 0 | 7 |
| Olive oil | 1 tbsp (14 g) | 120 | 0 | 0 | 14 |
| Avocado | half (100 g) | 160 | 2 | 9 | 15 |
| Creatine monohydrate | 5 g | 0 | 0 | 0 | 0 |
| Beer, lager | 500 ml | 215 | 2 | 18 | 0 |

## 5. LLM photo food logging

- Accuracy: NIH study (Nutrition 2026, preliminary, not yet peer reviewed): 4 popular photo apps on 102 weighed meals **underestimated by 250–345 kcal per meal on average**, fat by ~30 g; best on carbs, worst on hidden fats (oil, butter, sauces) (https://www.newswise.com/articles/photo-based-calorie-tracking-apps-may-underestimate-energy-in-meals). Vendor claim: SnapCalorie ±80–130 kcal on a 500 kcal dish (self-reported, https://apps.apple.com/us/app/-/id1574239307). A cited "≈36 % error for ChatGPT/Claude" figure was not traced to a paper (`UNVERIFIED`).
- Common estimate structure (Cal AI teardown, https://www.raftlabs.com/blog/cal-ai-product-teardown, and general practice): per item `{name, portion_desc, grams, kcal, protein_g, carbs_g, fat_g, confidence}` plus meal totals; the user edits portions, not macros.
- Tool-description guidance for an MCP `log_meal` tool (architect's recommendation, not a source fact): "Estimate from the photo or description. For each item first state the portion in household units and grams (plate ≈ 26 cm, fist ≈ 1 cup, palm ≈ 100 g cooked meat, thumb ≈ 1 tbsp), then derive kcal and macros from that portion. Add a cooking-fat item when food looks fried, roasted or sauced. Never ask the user for weights; pick the most likely portion and set `confidence` low/medium/high. Prefer a slightly high estimate for fat-rich dishes (photo estimates run low)."
