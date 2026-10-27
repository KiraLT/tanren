import type { CatalogEquipment } from "./taxonomy"

/**
 * Equipment that puts an external load on the movement: free weights, machines, cables
 * (programs-player-v2 §2.1, D1). Supports (`bench`, `rack`, `box`, …) are excluded: a loaded
 * exercise on them also lists the bar or dumbbell. `loaded.test.ts` checks every literal of
 * `CatalogEquipment` is either here or in the test's excluded list.
 */
export const LOADED_EQUIPMENT: ReadonlySet<CatalogEquipment> = new Set<CatalogEquipment>([
  "barbell",
  "dumbbell",
  "kettlebell",
  "trapBar",
  "ezBar",
  "plate",
  "landmine",
  "medicineBall",
  "smithMachine",
  "legPress",
  "hackSquat",
  "legExtension",
  "legCurl",
  "chestPressMachine",
  "pecDeck",
  "shoulderPressMachine",
  "hipAbductorMachine",
  "calfRaiseMachine",
  "abCrunchMachine",
  "assistedPullUpMachine",
  "cable",
  "latPulldown",
  "seatedRowMachine",
])

/** True when the exercise moves an external load (its sets carry a real `weightKg`). */
export const isLoadedEquipment = (equipment: ReadonlyArray<CatalogEquipment>): boolean =>
  equipment.some((item) => LOADED_EQUIPMENT.has(item))
