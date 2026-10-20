import { Layer } from "effect"
import { ExerciseRepo } from "./Exercise"
import { PlanRepo } from "./Plan"
import { ProfileRepo } from "./Profile"
import { SessionRepo } from "./Session"

export * from "./Exercise"
export * from "./Plan"
export * from "./Profile"
export * from "./Session"

/** Every repository; needs `D1Client` (`D1Layer(env.DB)`). */
export const Repositories = {
  layer: Layer.mergeAll(ProfileRepo.layer, ExerciseRepo.layer, PlanRepo.layer, SessionRepo.layer),
} as const
