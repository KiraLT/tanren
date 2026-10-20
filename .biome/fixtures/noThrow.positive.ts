// Positive sample for lint/plugin/noThrow: every throw below must be flagged.
export function parse(input: string): number {
	if (input === "") {
		throw new Error("empty input");
	}
	return Number(input);
}
export const fail = (): never => {
	throw "a bare string";
};
export async function load(): Promise<void> {
	throw new TypeError("not implemented");
}
