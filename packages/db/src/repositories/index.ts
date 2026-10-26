import { Layer } from "effect"
import { ActivityExportRepo } from "./ActivityExport"
import { ExerciseRepo } from "./Exercise"
import { IntegrationRepo } from "./Integration"
import { PlanRepo } from "./Plan"
import { ProfileRepo } from "./Profile"
import { SessionRepo } from "./Session"

export * from "./ActivityExport"
export * from "./Exercise"
export * from "./Integration"
export * from "./Plan"
export * from "./Profile"
export * from "./Session"

/** Every repository; needs `D1Client` (`D1Layer(env.DB)`). */
export const Repositories = {
  layer: Layer.mergeAll(
    ProfileRepo.layer,
    ExerciseRepo.layer,
    PlanRepo.layer,
    SessionRepo.layer,
    IntegrationRepo.layer,
    ActivityExportRepo.layer,
  ),
} as const
