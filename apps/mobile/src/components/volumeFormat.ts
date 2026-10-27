/** "4,230 kg": whole kilograms with a comma thousands separator. Leaf module: imports nothing. */
export const formatVolume = (kg: number): string =>
  `${String(Math.round(kg)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} kg`
