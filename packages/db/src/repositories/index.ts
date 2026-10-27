import { Layer } from "effect"
import { AccountErasure } from "./AccountErasure"
import { ActivityExportRepo } from "./ActivityExport"
import { ExerciseRepo } from "./Exercise"
import { IntegrationRepo } from "./Integration"
import { OAuthCodeUseRepo } from "./OAuthCodeUse"
import { PlanRepo } from "./Plan"
import { ProfileRepo } from "./Profile"
import { SessionRepo } from "./Session"
import { UserTokens } from "./UserTokens"

export * from "./AccountErasure"
export * from "./ActivityExport"
export * from "./Exercise"
export * from "./FoodEntry"
export * from "./GarminImport"
export * from "./Integration"
export * from "./OAuthCodeUse"
export * from "./Plan"
export * from "./Profile"
export * from "./Program"
export * from "./Session"
export * from "./UserTokens"

/** Every repository; needs `D1Client` (`D1Layer(env.DB)`). */
export const Repositories = {
  layer: Layer.mergeAll(
    ProfileRepo.layer,
    ExerciseRepo.layer,
    PlanRepo.layer,
    SessionRepo.layer,
    IntegrationRepo.layer,
    ActivityExportRepo.layer,
    UserTokens.layer,
    OAuthCodeUseRepo.layer,
    AccountErasure.layer,
  ),
} as const
