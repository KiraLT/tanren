# ADR-0016 — One equipment vocabulary; training locations in the profile row

Status: accepted (Lead decision under plan Amendment 3, 2026-10-21; owner reviews asynchronously)

## Context
The owner (2026-10-21 10:50) trains with gym machines more than dumbbells and wants to pick the
equipment available to him in Settings, per location (home vs gym). Today the catalog tags
exercises with `CatalogEquipment` (20 literals, one coarse `machine` on 19 entries) and the
profile stores `equipment: Array<{kind: EquipmentKind, note}>` with a second, coarser 16-literal
union mapped by `equipmentKindFor`. Nothing in the apps reads `profile.equipment`. The catalog is
static shared data (ADR-0013); the profile is a synced whole-row entity (sync.ts `member("profile")`).

## Decision
1. **One vocabulary.** `CatalogEquipment` is the only equipment type. It gains 17 specific
   machine/cable/bench literals and loses `machine` (docs/design/equipment.md §1, 36 literals in
   six UI groups). `EquipmentKind`, `Equipment`, `ProfileFields.equipment`, `EQUIPMENT_KIND` and
   `equipmentKindFor` are deleted.
2. **Locations are profile JSON.** `Profile.locations: Array<Location>` (≤ 10; `Location = {id:
   LocationId, name: Label, equipment: UniqueArray(CatalogEquipment)}`) and
   `Profile.activeLocationId: Option<LocationId>` replace `equipment`. No new sync entity: the
   profile row already syncs whole-row last-write-wins, which is acceptable for one user editing
   on one device at a time. Migration 0003 is `ADD COLUMN` only; the legacy `equipment` column
   stays `NOT NULL` and is always written as `'[]'` (design §2–3).
3. **Availability** is a pure shared function: an exercise is available at a location when every
   tag in its `equipment` is in the location's set; bodyweight (`[]`) always; no active location
   → everything (design §4). Presets: Gym (all), Home (dumbbell, kettlebell, bench, pullUpBar,
   band), Anywhere (none).
4. **Surfaces.** Settings "Equipment & locations" section; Library filter "At <location>" on by
   default; detail shows "Needs: …"; Today shows a setup card until a location exists. MCP gets a
   6th read tool `get_profile`, `update_profile` accepts the new fields, `search_exercises` gets
   `availableAt: LocationId | "active"` (design §5–6).

## Consequences
- The catalog grows by ≥ 50 machine/cable/Smith entries (stream EQ-C) and every `machine` entry
  is retagged; `taxonomy.ts` has one owner per round (EQ-C first, then EQ-1).
- Breaking wire change for `Profile` (field removed, two added). Single user, app and worker ship
  together; an old client's `equipment` key is an ignored excess property.
- D1 and the local store carry a dead `equipment` column until a table rebuild; documented in
  the Drizzle schema. `ProfileRow` must still encode `equipment: "[]"` (design §2 VERIFY).
- A profile that fails `uniqueLocationIds` / `activeLocationExists` on push fails the whole
  `PushRequest` decode (HttpApi 400) like every schema check, so a client must build profiles
  through `Profile.makeEffect` (mobile does).
- A pre-v3 bundle cannot decode a v3 profile on pull (its `Profile` required `equipment`), so web
  and OTA ship together with the Worker. The old-client decode defaults stay and there is no server
  guard: no pre-v3 client ever wrote a dirty profile row (EQ-R2 review).
- Removing the active location behaves differently by design: the app promotes the first remaining
  location (one-tap UX), while MCP `update_profile` rejects a patch that drops the active location
  unless `activeLocationId` is sent too (explicit API for Claude).
- MCP tool count 5/3/8 → 6/3/9; docs/design/mcp.md and the read slice change.
- **Promote locations to their own table when** any of: a second user/device edits locations
  concurrently (row-level LWW would drop edits), a session/plannedSession needs a `locationId`
  foreign key, or `locations` exceeds ~10 or carries per-implement detail (weights owned, racks).
  Then: `location` sync table with `userId`, `name`, `equipment` JSON; `profile.activeLocationId`
  stays.

## Alternatives considered
- **Own `location` table + sync entity now.** Correct long-term shape, but adds a sync member,
  D1 table, local table, repositories and MCP plumbing for one user with ≤ 3 locations. Rejected
  for this round; promotion criteria above.
- **Keep coarse `EquipmentKind` and map from catalog tags.** Cannot express "has a leg press but
  no hack squat", which is the owner's actual gym situation; two unions drift (the `other` kind
  with a note is unfilterable). Rejected.
- **Equipment as a flat set on the profile (no locations).** Does not answer "home vs gym".
- **Profile block inside `get_overview` instead of `get_profile`.** Fewer tools, but couples the
  overview's statement count to the profile and hides the profile behind a period argument.
  `get_profile` mirrors `update_profile`.

## Not decided here
Per-location session tagging (`session.locationId`), equipment weights owned at home, exercise
substitution suggestions when something is missing. Each is a later ADR.
