// Negative sample for lint/plugin/noSwitch: nothing below may be flagged.
import { Match } from "effect";

declare const kind: "a" | "b";
declare const n: number;

export const viaMatch = Match.value(kind).pipe(
	Match.when("a", () => 1),
	Match.when("b", () => 2),
	Match.exhaustive,
);
export const viaIf = (): string => {
	if (n === 1) {
		return "one";
	}
	if (n === 2) {
		return "two";
	}
	return "other";
};
export const switchLabel = "switch (n) { case 1: }"; // keyword inside a string
