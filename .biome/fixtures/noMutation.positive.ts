// Positive sample for lint/plugin/noMutation (++ and -- are style/noIncrementDecrement).
declare const obj: { a: number; nested: { b: number }; list: number[] };
declare const arr: number[];
declare const record: Record<string, number>;
declare const key: string;
declare const i: number;
declare let counter: number; // ambient, so noLet stays silent

obj.a = 1; // a.b = c
arr[i] = 2; // a[i] = c
obj.nested.b = 3;
obj.a += 1; // compound assignment to a member
record[key] ??= 0;
(obj.a as number) = 4; // wrapped target
[obj.a, arr[0]] = [5, 6]; // destructuring into members
({ a: obj.a } = { a: 7 });

counter++; // x++ : style/noIncrementDecrement
obj.a++; // member ++ : style/noIncrementDecrement (the plugin defers to it)
--arr[i];

arr.push(1);
arr.pop();
arr.shift();
arr.unshift(0);
arr.splice(0, 1);
arr.sort();
arr.reverse();
arr.fill(0);
arr.copyWithin(0, 1);
obj.list.push(8);
arr?.push(9);
arr["sort"]();

delete obj.a;
delete record[key]; // dynamic key: performance/noDelete would miss this one

Object.assign(obj, { a: 10 });
Object.assign(record, { x: 1 }, { y: 2 });
