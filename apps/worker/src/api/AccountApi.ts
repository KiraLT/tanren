import { AccountDeleted } from "@tanren/shared"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/http-api"
import { Authentication } from "./Authentication"

/** ADR-0024, docs/design/legal.md §1.7: the signed-in user erases their account. */
export class AccountApi extends HttpApiGroup.make("account")
  .add(
    HttpApiEndpoint.post("delete", "/api/account/delete", {
      success: AccountDeleted,
      error: HttpApiError.InternalServerError,
    }),
  )
  .middleware(Authentication) {}
