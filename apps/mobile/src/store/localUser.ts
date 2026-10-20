import { UserId } from "@tanren/shared"

/** The single local owner until auth lands (step 3 integration). A fixed, valid v4 UUID. */
export const LOCAL_USER_ID: UserId = UserId.make("00000000-0000-4000-8000-00000000a11c")
