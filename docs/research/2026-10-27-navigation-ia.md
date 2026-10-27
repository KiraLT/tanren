# Navigation and information architecture of comparable apps (2026-10-27, NAV-D)

Research box 6 min (web, standard search + two fetches). Facts marked **verified** come from a fetched page;
**secondary** from search snippets of third-party articles; **unverified** from memory, to be checked by the
engineer or a later spike before anything is copied literally. Nothing here is a spec; `docs/design/navigation-v2.md` is.

## Strava (mobile) — 5 tabs, one of them an action

| tab | contains | source |
| --- | --- | --- |
| Home | the social feed (activities of people you follow, kudos, comments); the old "Feed" renamed | verified: zenocycleparts.com/blogs/cyclingtips/new-strava-update-makes-big-changes-to-layout-organization-and-navigation (article dated 2021-05-07) |
| Maps | segments explorer, suggested routes with filters, Saved (routes, starred segments) — the old "Explore" | verified, same article |
| Record | the start/record screen, centre slot, unchanged by the redesign | verified, same article |
| Groups | Challenges and Clubs (social moved out of the feed) | verified, same article; also quadlockcase.co.uk/blogs/news/new-strava-layout-preview (secondary) |
| You | profile + **Progress section** (training log, goals, training intensity, fitness) + the old Training tab's insights | verified, same article |

Pattern: the fifth slot is an **action**, not a page; profile is a **hub** ("You") that absorbed a whole former tab
(Training); Settings is reached from the You tab's gear (secondary, quadlock; location not stated in the fetched
article). New features (Goals, Athlete Intelligence, Flyover) land as sections on You or cards in Home, never as tabs.

## Garmin Connect (mobile, 2024 redesign) — Home as a card stack, everything else behind a menu

- Home is split into sections: **Today's Activity, In Focus** (user-chosen, up to five high-priority metrics),
  **At a Glance, Events, Training Plans, Challenges** (secondary: androidauthority.com/garmin-connect-redesign-3364392,
  techradar.com; both report the January 2024 CES beta; final rollout "later in 2024").
- Tab bar: **unverified** — memory says Home · Training & Planning · Performance Stats · Health Stats · Devices ·
  More (left-drawer in older builds). Treat the count as "4 + More" until an engineer opens the app.
- Pattern: Home is a **configurable summary** (cards the user pins); deep data lives under categorised hubs
  (Health, Performance, Training) reached from More; the device is a first-class hub because the business is hardware.

## Apple Fitness (iOS) — 2 tabs

- **Summary** (rings, trends, workouts, awards folded into one scrolling page) and **Sharing**; Fitness+ as a third tab
  where available. iOS 14 collapsed the earlier five Activity tabs (Activity, Trends, Workouts, Awards, Sharing)
  into Summary (secondary: macstories.net/stories/the-new-fitness-app-in-ios-14/, imore.com/fitness-app-everything-you-need-know).
- Pattern: **one summary page with stacked stat surfaces** replaces tabs; detail is one tap deeper.

## Hevy (strength logging) — 3 tabs

- **Home** (discovery feed), **Workout** (start an empty workout, Routines with an Explore button for programs),
  **Profile** (stats, and the **Exercises** library behind a button; Settings gear top-right) (secondary:
  hotelgyms.com/blog/how-to-use-the-hevy-app, help.hevyapp.com articles 35688251991575 and 36011518408983).
- Pattern: the exercise library is **not a tab**; "start" is the hub page of the Workout tab; routines/programs are a
  section of that hub.

## Strong (strength logging) — unverified

- Memory: 5 tabs Profile · History · **Start Workout** (centre) · Exercises · Measure. Search found only the App Store
  listing (apps.apple.com/za/app/id464254577: "advanced statistics… personal records") and a third-party screenshot of
  a profile page with charts (spark.mwm.ai). **Unverified** tab list; keep as a data point only.

## Takeaways used in navigation-v2.md

1. Nobody ships more than five slots; the trend is **down** (Apple 2, Hevy 3, Strava 4 + action).
2. **Start** is either a centre action slot (Strava, Strong) or the hero of the training hub (Hevy). A fitness
   logger's start is the most-used control after "log set"; a gear icon on another tab is the wrong place for anything
   used daily.
3. **Profile / You** is the universal hub for progress, stats, settings and integrations (Strava, Hevy, Garmin's More).
4. **Home is a card stack** (Garmin sections, Apple Summary): new features add a card, not a tab.
5. **Reference material** (exercise library, routines/programs catalog) lives one tap inside a hub (Hevy), never as a
   top-level destination.
