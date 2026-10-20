import { IdGenerator, Uuid } from "@tanren/shared"
import { Array as Arr, Effect, Layer, Random } from "effect"

const hex = (byte: number): string => byte.toString(16).padStart(2, "0")

/** Version nibble 4 and variant bits `10`, so the result is a valid v4 UUID. */
const withVersionBits = (byte: number, index: number): number =>
  index === 6 ? 0x40 | (byte & 0x0f) : index === 8 ? 0x80 | (byte & 0x3f) : byte

const format = (bytes: ReadonlyArray<number>): string => {
  const digits = bytes.map(hex).join("")
  return [
    digits.slice(0, 8),
    digits.slice(8, 12),
    digits.slice(12, 16),
    digits.slice(16, 20),
    digits.slice(20, 32),
  ].join("-")
}

/**
 * Ids drawn from the fiber's `Random` service: under `Random.withSeed` the id sequence is a pure
 * function of the seed (`IdGenerator.layerTest` is not used: its first id is the seed user's).
 */
export const seededIdGenerator: Layer.Layer<IdGenerator> = Layer.succeed(
  IdGenerator,
  IdGenerator.of({
    next: Effect.forEach(Arr.range(0, 15), () => Random.nextIntBetween(0, 255)).pipe(
      Effect.map((bytes) => format(bytes.map(withVersionBits))),
      Effect.flatMap((raw) => Uuid.makeEffect(raw)),
      // A formatted v4 UUID always passes the check, so a failure is a defect.
      Effect.orDie,
    ),
  }),
)
