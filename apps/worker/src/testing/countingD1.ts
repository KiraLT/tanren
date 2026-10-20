import { MutableRef } from "effect"

// Test-only: counts what a request costs against D1's per-invocation statement limit (Free: 50).
// `@effect/sql-d1` caches prepared statements per client, so `prepare` calls undercount; this counts
// executions instead: every `first`/`run`/`all`/`raw` call and every member of a `batch`.

export interface D1Counts {
  /** Statements executed one by one (`first` / `run` / `all` / `raw` / `exec`). */
  readonly single: number
  /** `db.batch` calls (D1 runs each as one transaction). */
  readonly batches: number
  /** Statements sent inside those batches. */
  readonly batched: number
}

export interface CountingD1 {
  readonly db: D1Database
  readonly counts: () => D1Counts
  /** `single + batched`: every statement D1 executes. */
  readonly statements: () => number
}

const ZERO: D1Counts = { single: 0, batches: 0, batched: 0 }
const EXECUTE = new Set<string | symbol>(["first", "run", "all", "raw"])

/** A property of the real binding object; methods stay bound to it (workerd uses private fields). */
const forward = (target: object, prop: string | symbol): unknown => {
  const value: unknown = Reflect.get(target, prop)
  return typeof value === "function" ? value.bind(target) : value
}

/**
 * Wraps a D1 binding in Proxies (the binding and its statements are workerd objects, so the
 * wrapper keeps their exact type without a cast and forwards everything it does not count).
 */
export const countingD1 = (db: D1Database): CountingD1 => {
  const ref = MutableRef.make(ZERO)
  const add = (delta: Partial<D1Counts>): void => {
    MutableRef.update(ref, (counts) => ({
      single: counts.single + (delta.single ?? 0),
      batches: counts.batches + (delta.batches ?? 0),
      batched: counts.batched + (delta.batched ?? 0),
    }))
  }
  const statement = (real: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(real, {
      get: (target, prop) =>
        prop === "bind"
          ? (...values: ReadonlyArray<unknown>) => statement(target.bind(...values))
          : EXECUTE.has(prop)
            ? (...args: ReadonlyArray<unknown>) => {
                add({ single: 1 })
                return Reflect.apply(Reflect.get(target, prop), target, args)
              }
            : forward(target, prop),
    })
  const counted = new Proxy(db, {
    get: (target, prop) =>
      prop === "prepare"
        ? (query: string) => statement(target.prepare(query))
        : prop === "batch"
          ? (statements: Array<D1PreparedStatement>) => {
              add({ batches: 1, batched: statements.length })
              return target.batch(statements)
            }
          : prop === "exec"
            ? (query: string) => {
                add({ single: 1 })
                return target.exec(query)
              }
            : forward(target, prop),
  })
  const counts = () => MutableRef.get(ref)
  return {
    db: counted,
    counts,
    statements: () => counts().single + counts().batched,
  }
}
