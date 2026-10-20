// Negative sample for lint/plugin/noLet: nothing below may be flagged.
export const letter = "let"; // `let` inside identifiers and strings
export const { outlet, ...rest } = { outlet: 1, other: 2 };
export const sum = (xs: ReadonlyArray<number>) => xs.reduce((acc, x) => acc + x, 0);

declare let ambientCounter: number; // ambient declaration: no runtime binding
declare global {
	let __TANREN_DEBUG__: boolean;
}
export const readAmbient = () => ambientCounter;
