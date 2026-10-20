import { Array as Arr, type Option } from "effect"
import type { Program, ProgramId } from "./Program"

export * from "./Program"

/** Every built-in program; `CORE30` joins with V2-P1. */
export const PROGRAMS: ReadonlyArray<Program> = []

export const findProgram = (id: ProgramId): Option.Option<Program> =>
  Arr.findFirst(PROGRAMS, (program) => program.programId === id)
