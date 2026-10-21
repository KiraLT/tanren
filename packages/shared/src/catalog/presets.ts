import { Schema } from "effect"
import { CatalogEquipment } from "./taxonomy"

/** The six UI groups of the equipment vocabulary (equipment.md §1); key order = display order. */
export const EquipmentGroup = Schema.Literals([
  "freeWeights",
  "benchesRacks",
  "machines",
  "cables",
  "bodyweightAccessories",
  "cardio",
])
export type EquipmentGroup = typeof EquipmentGroup.Type

export const EQUIPMENT_GROUP_LABEL: { readonly [G in EquipmentGroup]: string } = {
  freeWeights: "Free weights",
  benchesRacks: "Benches & racks",
  machines: "Machines",
  cables: "Cables",
  bodyweightAccessories: "Bodyweight & accessories",
  cardio: "Cardio",
}

/** Every literal in exactly one group; order within a group = display order (§1 table). */
export const EQUIPMENT_GROUPS: {
  readonly [G in EquipmentGroup]: ReadonlyArray<CatalogEquipment>
} = {
  freeWeights: [
    "barbell",
    "dumbbell",
    "kettlebell",
    "trapBar",
    "ezBar",
    "plate",
    "landmine",
    "medicineBall",
  ],
  benchesRacks: [
    "bench",
    "rack",
    "preacherBench",
    "backExtensionBench",
    "gluteHamDeveloper",
    "box",
  ],
  machines: [
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
  ],
  cables: ["cable", "latPulldown", "seatedRowMachine"],
  bodyweightAccessories: [
    "pullUpBar",
    "dipStation",
    "band",
    "abWheel",
    "foamRoller",
    "suspensionTrainer",
  ],
  cardio: ["cardioMachine"],
}

export const LocationPreset = Schema.Literals(["commercialGym", "home", "bodyweightOnly"])
export type LocationPreset = typeof LocationPreset.Type

/** Starting points for a new location (§1): a full gym, a typical home setup, nothing. */
export const LOCATION_PRESETS: {
  readonly [P in LocationPreset]: {
    readonly name: string
    readonly equipment: ReadonlyArray<CatalogEquipment>
  }
} = {
  commercialGym: { name: "Gym", equipment: CatalogEquipment.literals },
  home: { name: "Home", equipment: ["dumbbell", "kettlebell", "bench", "pullUpBar", "band"] },
  bodyweightOnly: { name: "Anywhere", equipment: [] },
}
