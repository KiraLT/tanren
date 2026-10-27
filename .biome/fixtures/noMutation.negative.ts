// Negative sample for lint/plugin/noMutation: nothing below may be flagged.
// `Array as Arr`: importing `Array` itself trips the recommended suspicious/noShadowRestrictedNames.
import { Array as Arr, Order, Record } from "effect";

declare const b: { readonly a: number; readonly c: number };
declare const xs: ReadonlyArray<number>;

export const a = { ...b }; // spread copy
export const doubled = xs.map((x) => x * 2);
export const copy = Object.assign({}, b); // fresh object literal as target
export const merged = Object.assign({ z: 0 }, b, { c: 2 });
export const sortedEffect = Arr.sort(xs, Order.number); // effect Array.sort returns a new array
export const descending = Order.reverse(Order.number); // effect Order.reverse is pure
export const reversed = Arr.reverse(xs);
export const sortedNative = xs.toSorted((l, r) => l - r);
export const appended = [...xs, 4];
export const { a: dropped, ...withoutA } = b; // copy without a key
export const withoutC = Record.remove({ c: 1, d: 2 }, "c");
export const isOne = b.a === 1; // comparison, not assignment

// Method names that only CONTAIN a mutator name are not mutators (the pattern is anchored).
declare const loads: {
  readonly prefill: () => number;
  readonly backfill: () => number;
  readonly pushed: () => number;
  readonly sorted: () => number;
  readonly unshiftLater: () => number;
};
export const prefilled = loads.prefill();
export const backfilled = loads.backfill();
export const wasPushed = loads.pushed();
export const isSorted = loads.sorted();
export const later = loads.unshiftLater();
export const quotedPrefill = loads["prefill"]();
export const quotedSorted = loads["sorted"]();
