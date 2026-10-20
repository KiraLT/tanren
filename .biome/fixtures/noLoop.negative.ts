// Negative sample for lint/plugin/noLoop: nothing below may be flagged.
import { Effect } from "effect";

declare const xs: ReadonlyArray<number>;

export const total = xs.reduce((sum, x) => sum + x, 0);
export const evens = xs.filter((x) => x % 2 === 0);
export const logAll = Effect.forEach(xs, (x) => Effect.log(x));
export const countdown = Effect.iterate(3, {
	while: (n) => n > 0,
	body: (n) => Effect.succeed(n - 1),
});
export const forLabel = "for while do"; // keywords inside strings
