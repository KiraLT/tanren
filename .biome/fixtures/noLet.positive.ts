// Positive sample for lint/plugin/noLet: every `let` below must be flagged.
export function total(values: ReadonlyArray<number>): number {
	let sum = 0; // reassigned below, so style/useConst is silent: only the plugin catches it
	sum = values.length;
	return sum;
}

let neverReassigned = 1; // plugin + style/useConst (safe fix: const)
let first = 1,
	second = 2; // several declarators over several lines
export let exported = 3;
export const pair = [neverReassigned, first, second];

declare function use(value: unknown): void;
export function headers(xs: ReadonlyArray<number>): void {
	for (let index = 0; index < xs.length; index += 1) {} // plugin (the loop is also noLoop)
	for (let x of xs) use(x); // JsForVariableDeclaration (the loop is also noLoop)
}
