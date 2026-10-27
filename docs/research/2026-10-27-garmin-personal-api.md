# Garmin Personal API: what it serves and how (spike G1, 2026-10-27)

**Question.** What does Garmin's free Personal tier serve to the owner's own key, at which base URL, with what auth, windows, limits and terms?

**Setup.** Owner key read into a shell variable from the scratchpad (never printed). curl from macOS, 13:04–13:09 EET. Spec taken from the
OpenAPI 3.0.1 document embedded in `developer.garmin.com/component---src-pages-gc-developer-program-personal-swagger-docs-js-*.js`
(`"title":"Garmin Connect Personal API"`, `"servers":[{"url":"https://personal.connectapi.garmin.com"},{"url":"https://personal.connectapi.garmin.cn"}]`, 27 GET operations, no write ops).

## Observation (status for this key; personal values redacted)
| Request | Result |
|---|---|
| `GET apis.garmin.com/wellness-api/rest/user/id`, `/user/permissions` with `Bearer <key>` | 401 `{"errorMessage":"Unauthorized Request"}` (partner API: not this tier) |
| `POST personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token` + `Authorization: ApiKey <key>` | 200 `text/plain` body = RS256 JWT; iss `https://diauth.garmin.com`; exp−iat = 24 h; scope `CONNECT_READ, PERSONAL_API_{FITNESS,NUTRITION,USER,WELLNESS}_READ` |
| same with `ApiKey invalid` | 401, empty body |
| any data path, `Bearer invalid` | 401, `www-authenticate: Bearer error="invalid_token", error_description="Token is not active"` |
| any data path, no header | 400 `{"error":"Authentication missing","status":400}` |
| `/userprofile-service/userprofile/settings` | 200 (displayName, measurementSystem, availableTrainingDays, preferredLongTrainingDays, …) |
| `/activitylist-service/activities/search/activities?start&limit` | 200 for limit 100/200; **500 for 300, 500, 1000**. Paging by `start` reached the oldest activity (2018, ~850 total): **full history** |
| same + `startDate=2026-08-01&endDate=2026-08-31` | 200, only that month (date filter works, `YYYY-MM-DD`) |
| `/activity-service/activity/{id}` (strength) | 200: summaryDTO{startTimeLocal/GMT, duration, elapsedDuration, movingDuration, calories, bmrCalories, averageHR, minHR, maxHR, totalSets, activeSets, totalExerciseReps, trainingEffect, …} |
| `/activity-service/activity/{id}/workouts` | 200 `[]` |
| `/download-service/files/activity/{id}` | 200 `application/x-zip-compressed`, zip with `<id>_ACTIVITY.fit` |
| `/usersummary-service/usersummary/daily?calendarDate=` | 200 (activeKilocalories, bmrKilocalories, steps, averageStressLevel, bodyBattery*, averageSpo2, restingHeartRate, …) |
| `/usersummary-service/v2/dailysummaries?startDate&endDate` | 200 for 7 d and 365 d (513 KB); **400 for 367 d** |
| `/usersummary-service/stats/steps/daily/{a}/{b}` | 200 for 28 d (calendarDate, totalSteps, totalDistance, stepGoal); **400 for 31 d** |
| `/usersummary-service/stats/stress/daily/{a}/{b}` (7 d) | 200 [{calendarDate, values}] |
| `/sleep-service/sleep/dailySleep?date=` | 200 for yesterday, 60 d back and **5 years back** (deep/light/rem/awakeSleepSeconds, sleepStart/EndTimestampGMT, …) |
| `/sleep-service/sleep/dailySleepSummariesByDate` | 200 for 31 d; **400 for 61 d** |
| `/wellness-service/wellness/dailyHeartRate?date=` | 200 (restingHeartRate, min/maxHeartRate, heartRateValues[], …) |
| `/wellness-service/wellness/bodyBattery/reports/daily` (7 d), `/hrv-service/hrv/daily/{a}/{b}` (7 d), `/weight-service/weight/range/{a}/{b}`, `/biometric-service/heartRateZones/v2` | 200 each |
| `/wellnessactivity-service/activity/summary/range/{a}/{b}` (7 d) | 200 `[]` |
| 40 back-to-back `GET userprofile/settings` | 40 × 200; response headers: date, content-type, cache-control, cf-ray, server … **no X-RateLimit-* / Retry-After** |

Strength activities in the list carry `summarizedExerciseSets: [{category, reps, volume, duration, sets}]` plus `totalSets, activeSets, totalReps`
(the sample had category `UNKNOWN`: per-exercise names only if the watch recorded them).

## Answer
- **Base URL** `https://personal.connectapi.garmin.com` (China: `.cn`). Not the partner `apis.garmin.com/wellness-api`.
- **Auth** two-step: key → `POST …/personal-api-key/token` with `Authorization: ApiKey <key>` → 24 h JWT → `Authorization: Bearer <jwt>`.
  FAQ: "Access tokens are valid for 24 hours or until the Personal API key expires, whichever occurs first"; no refresh tokens (re-exchange the key).
- **Key lifetime** chosen at creation: 30 / 90 / 180 / 365 days; Garmin emails ~1 week before expiry. Created and deleted at
  `https://connect.garmin.com/app/settings/personalApiToken`; FAQ: "Once deleted, the key and any access tokens associated with that key, will no longer be usable." Key shown once.
- **Windows** are date-based (`YYYY-MM-DD`), not the partner API's 24 h upload windows: activities paginate by offset (limit ≤ 200 works, 300 → 500); dailies ≤ 365 d; steps/stress ≤ 28 d; sleep, body battery, hydration ≤ 31 d (spec text, steps and sleep observed).
  No "current vs past" split: the whole account history is readable (activities back to 2018, sleep 5 years back).
- **Rate limits** none advertised in headers, the spec or the FAQ; 40 rapid calls passed. Unknown ceiling.
- **Terms** FAQ: "The Personal API is intended for individual Garmin users who want programmatic access to their own data." / "It is not intended for commercial applications serving multiple end users."
  Third-party hosting and sharing the key: not stated. Pull-only, read-only scopes; no webhooks.

**Confidence.** observed (endpoints, statuses, windows, headers, token TTL); quoted (FAQ key lifetime, deletion, intent); unknown (rate ceiling, cost, exact activity page cap between 200 and 300).

## What it means for Tanren
Owner-only Garmin import is feasible from the Worker: store the owner's key as a secret (not in D1 for other users), exchange it for a JWT at most
once per 24 h, pull `activities/search` by date range (≤ 200 per page) and `usersummary`/`sleep` dailies on a cron. It fits "personal tracker for
one user"; it does not fit offering Garmin connect to other users (that needs the partner program's OAuth). Key rotation every ≤ 365 days is a manual owner step.
