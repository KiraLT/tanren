// Negative sample for lint/plugin/noThrow: nothing below may be flagged.
import { Data, Effect } from "effect";

export class EmptyInput extends Data.TaggedError("EmptyInput")<{ readonly input: string }> {}
export const parse = (input: string) =>
	input === "" ? Effect.fail(new EmptyInput({ input })) : Effect.succeed(Number(input));
export const defect = Effect.die("unreachable");
export const throwLabel = "throw"; // the word in identifiers and strings
