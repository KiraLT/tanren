// Negative sample for lint/plugin/noClass: nothing below may be flagged.
import { Context, Data, Effect, Layer, Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

interface ClockShape {
	readonly now: Effect.Effect<number>;
}

// Effect 4: Context.Service, two-stage form, with a static layer
export class Clock extends Context.Service<Clock, ClockShape>()("@tanren/Clock") {
	static readonly layer = Layer.succeed(this, { now: Effect.succeed(0) });
}
// Effect 4: Context.Service with effectful construction
export class Ids extends Context.Service<Ids>()("@tanren/Ids", {
	make: Effect.succeed({ next: () => "id" }),
}) {}
// Effect 3: Context.Tag and Effect.Service
export class SessionRepo extends Context.Tag("@tanren/SessionRepo")<SessionRepo, ClockShape>() {}
export class Notifier extends Effect.Service<Notifier>()("@tanren/Notifier", { succeed: {} }) {}
// Data
export class NotFound extends Data.TaggedError("NotFound")<{ readonly id: string }> {}
export class Tick extends Data.TaggedClass("Tick")<{ readonly at: number }> {}
// Schema
export class Person extends Schema.Class<Person>("Person")({ name: Schema.String }) {}
export class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
	message: Schema.String,
}) {}
export class Ping extends Schema.TaggedClass<Ping>()("Ping", { id: Schema.String }) {}
// HttpApi definitions (effect-conventions section 7)
export class SetsApi extends HttpApiGroup.make("sets").add(
	HttpApiEndpoint.get("byId", "/sets/:id", { success: Person }),
	HttpApiEndpoint.post("log", "/sets", { payload: Person, success: Person }),
) {}
export class Api extends HttpApi.make("tanren").add(SetsApi) {}
// Class expression with an allowed factory
export const Boom = class extends Data.TaggedError("Boom") {};
// Ambient declarations: type-only, no runtime class
declare class Ambient {
	readonly id: string;
}
export declare class AmbientExported {}
export type AmbientId = Ambient["id"];
