import { Array as Arr, type Option } from "effect"
import { CORE30 } from "./core30"
import type { Program, ProgramId } from "./Program"

export * from "./core30"
export * from "./Program"

/** Every built-in program. */
export const PROGRAMS: ReadonlyArray<Program> = [CORE30]

export const findProgram = (id: ProgramId): Option.Option<Program> =>
  Arr.findFirst(PROGRAMS, (program) => program.programId === id)
