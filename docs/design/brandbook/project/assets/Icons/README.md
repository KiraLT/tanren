# Icons

40 stroke glyphs on a 24 x 24 grid, 2 px round caps and joins, geometry after Lucide (ISC; notice in `apps/mobile/src/ui/iconPaths.ts`). The app draws them from path data with `react-native-svg`, so they take any theme colour; these SVGs are rendered in a fixed mid-grey ink `#8A919B` (reads on both themes; `<img>` cannot inherit colour).

Sizes: 16 (chips, discs, status pills), **20 (rows and meta: the row icon slot is exactly 20 wide, the title starts at 16 + 20 + 12 = 48)**, 24 (tabs, buttons, AppBar), 28 (empty states). Tabs: active stroke 2 in `accent`, inactive 1.75 in `text-muted`. The stepper's `plus` / `minus` render at 30 px with stroke 2.5.

Names by use: tabs `zap` Today, `calendar` Plan, `grid` Programs, `book` Library, `chart` Progress · equipment `dumbbell`, `kettlebell`, `band`, `bodyweight` (= `user`), `home`, `mapPin` · meta `target` muscle, `repeat` reps, `timer`, `clock` duration, `flame` · actions `check`, `plus`, `minus`, `swap`, `play`, `pause`, `skip`, `download`, `trash`, `logout`, `settings`, `sun`, `moon` · chrome `chevronLeft/Right/Down`, `close`, `more`, `search`, `filter`, `list`, `info`, `warning`.
