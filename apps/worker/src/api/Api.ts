import {
  CurrentPlan,
  Exercise,
  ExerciseId,
  ExerciseInsert,
  ExercisePatch,
  Forbidden,
  NotFound,
  Plan,
  Profile,
  ProfileInsert,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  Session,
  SessionId,
  SessionInsert,
  SessionPatch,
  SetId,
  Timestamp,
  ValidationError,
  WorkoutSet,
  WorkoutSetInsert,
  WorkoutSetPatch,
} from "@tanren/shared"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/http-api"
import { AccountApi } from "./AccountApi"
import { Authentication } from "./Authentication"
import { IntegrationsApi } from "./IntegrationsApi"

const Internal = HttpApiError.InternalServerError
const readErrors = [NotFound, Internal]
const writeErrors = [NotFound, ValidationError, Forbidden, Internal]

export class HealthApi extends HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("health", "/health", { success: Schema.Struct({ ok: Schema.Boolean }) }),
) {}

export class ProfileApi extends HttpApiGroup.make("profile")
  .add(HttpApiEndpoint.get("get", "/profile", { success: Profile, error: readErrors }))
  .add(
    HttpApiEndpoint.put("put", "/profile", {
      payload: ProfileInsert,
      success: Profile,
      error: writeErrors,
    }),
  )
  .middleware(Authentication) {}

const exerciseParams = { id: ExerciseId }
export class ExercisesApi extends HttpApiGroup.make("exercises")
  .add(
    HttpApiEndpoint.get("list", "/exercises", { success: Schema.Array(Exercise), error: Internal }),
  )
  .add(
    HttpApiEndpoint.get("get", "/exercises/:id", {
      params: exerciseParams,
      success: Exercise,
      error: readErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("create", "/exercises", {
      payload: ExerciseInsert,
      success: Exercise,
      error: writeErrors,
    }),
  )
  .add(
    HttpApiEndpoint.patch("update", "/exercises/:id", {
      params: exerciseParams,
      payload: ExercisePatch,
      success: Exercise,
      error: writeErrors,
    }),
  )
  .add(
    HttpApiEndpoint.delete("remove", "/exercises/:id", {
      params: exerciseParams,
      error: writeErrors,
    }),
  )
  .middleware(Authentication) {}

const sessionParams = { id: SessionId }
export class SessionsApi extends HttpApiGroup.make("sessions")
  .add(
    HttpApiEndpoint.get("list", "/sessions", {
      query: { from: Timestamp, to: Timestamp },
      success: Schema.Array(Session),
      error: Internal,
    }),
  )
  .add(
    HttpApiEndpoint.get("get", "/sessions/:id", {
      params: sessionParams,
      success: Session,
      error: readErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("create", "/sessions", {
      payload: SessionInsert,
      success: Session,
      error: writeErrors,
    }),
  )
  .add(
    HttpApiEndpoint.patch("update", "/sessions/:id", {
      params: sessionParams,
      payload: SessionPatch,
      success: Session,
      error: writeErrors,
    }),
  )
  .add(
    HttpApiEndpoint.delete("remove", "/sessions/:id", {
      params: sessionParams,
      error: writeErrors,
    }),
  )
  .add(
    HttpApiEndpoint.get("sets", "/sessions/:id/sets", {
      params: sessionParams,
      success: Schema.Array(WorkoutSet),
      error: readErrors,
    }),
  )
  .middleware(Authentication) {}

// Session id is `:id` on every `/sessions/:id…` route, so the router sees one param name per segment.
const setParams = { id: SessionId, setId: SetId }
export class SetsApi extends HttpApiGroup.make("sets")
  .add(
    HttpApiEndpoint.post("create", "/sessions/:id/sets", {
      params: sessionParams,
      payload: WorkoutSetInsert,
      success: WorkoutSet,
      error: writeErrors,
    }),
  )
  .add(
    HttpApiEndpoint.patch("update", "/sessions/:id/sets/:setId", {
      params: setParams,
      payload: WorkoutSetPatch,
      success: WorkoutSet,
      error: writeErrors,
    }),
  )
  .add(
    HttpApiEndpoint.delete("remove", "/sessions/:id/sets/:setId", {
      params: setParams,
      error: writeErrors,
    }),
  )
  .middleware(Authentication) {}

export class PlansApi extends HttpApiGroup.make("plans")
  .add(HttpApiEndpoint.get("list", "/plans", { success: Schema.Array(Plan), error: Internal }))
  .add(
    HttpApiEndpoint.get("current", "/plans/current", {
      success: CurrentPlan,
      error: [HttpApiError.NotFound, Internal],
    }),
  )
  .middleware(Authentication) {}

export class SyncApi extends HttpApiGroup.make("sync")
  .add(
    HttpApiEndpoint.post("push", "/sync/push", {
      payload: PushRequest,
      success: PushResponse,
      error: [Forbidden, Internal],
    }),
  )
  .add(
    HttpApiEndpoint.post("pull", "/sync/pull", {
      payload: PullRequest,
      success: PullResponse,
      error: [ValidationError, Internal],
    }),
  )
  .middleware(Authentication) {}

export class Api extends HttpApi.make("tanren")
  .add(HealthApi)
  .add(ProfileApi)
  .add(ExercisesApi)
  .add(SessionsApi)
  .add(SetsApi)
  .add(PlansApi)
  .add(SyncApi)
  .add(IntegrationsApi)
  .add(AccountApi) {}
