// Positive sample for lint/plugin/noSwitch: three switch statements.
declare const n: number;
declare const kind: "a" | "b";

export function plain(): string {
	switch (n) {
		case 1:
			return "one";
		case 2:
			return "two";
	}
	return "other";
}

export const arrow = (): number => {
	switch (kind) {
		case "a":
			return 1;
		case "b":
			return 2;
	}
};

export function withDefault(): string {
	switch (n) {
		case 0:
			return "zero";
		default:
			return "many";
	}
}
