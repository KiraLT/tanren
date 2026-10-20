// Positive sample for lint/plugin/noClass: every class below must be flagged.
import { Data, Schema } from "effect";

declare const Base: new () => object;
declare function mixin<T>(base: T): new () => object;
declare const Person: { extend: <S>(id: string) => (fields: object) => new () => S };
declare const NotHttpApi: { make: (id: string) => new () => object };

export class Plain {}
export class Child extends Base {}
export class AppError extends Error {}
export abstract class Shape {}
export const Anonymous = class {};
export default class {}
export class NotAFactory extends mixin(Data.TaggedError) {} // allowed name passed as an argument
export class Extended extends Person.extend<Extended>("Extended")({ age: Schema.Number }) {} // known gap: .extend
export class LookAlike extends NotHttpApi.make("api") {} // not an allowed root
