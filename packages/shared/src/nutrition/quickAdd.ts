import { Array as Arr, Option, Order, pipe, Schema } from "effect"
import { Label } from "../common"
import { type FoodItem, Grams, Kcal, Meal } from "../nutrition"

/**
 * The quick-add catalog (nutrition.md §7). Every value is computed from USDA FoodData Central
 * (SR Legacy, CC0) per-100 g values scaled to the portion: kcal rounded to an integer, macros to
 * 0.1 g. The FDC id(s) and grams are in the comment above each row; composites add two foods.
 * Dropped as not verifiable in SR Legacy: casein shake, protein bar (branded only), creatine.
 */
export const QuickAddItem = Schema.Struct({
  /** Slug, unique. */
  id: Schema.String,
  name: Label,
  portion: Label,
  grams: Schema.OptionFromNullOr(Grams),
  kcal: Kcal,
  proteinG: Grams,
  carbsG: Grams,
  fatG: Grams,
  /** Default meal for the editor. */
  meal: Meal,
  aliases: Schema.Array(Schema.String),
})
export type QuickAddItem = typeof QuickAddItem.Type

const item = (
  id: string,
  name: string,
  portion: string,
  grams: number,
  kcal: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
  meal: Meal,
  aliases: ReadonlyArray<string>,
): QuickAddItem => ({
  id,
  name,
  portion,
  grams: Option.some(grams),
  kcal,
  proteinG,
  carbsG,
  fatG,
  meal,
  aliases,
})

export const QUICK_ADD: ReadonlyArray<QuickAddItem> = [
  // FDC 173180 (Beverages, Protein powder whey based, 30 g)
  item(
    "whey-scoop",
    "Whey protein shake",
    "1 scoop in water, 30 g",
    30,
    106,
    23.4,
    1.9,
    0.5,
    "supplement",
    ["shake", "protein"],
  ),
  // FDC 173180 (whey powder, 30 g) + 171267 (Milk, reduced fat, fluid, 2% milkfat, 305 g)
  item(
    "whey-milk",
    "Whey shake with milk",
    "1 scoop + 300 ml 2 % milk",
    335,
    258,
    33.5,
    16.5,
    6.5,
    "supplement",
    ["shake"],
  ),
  // FDC 171287 (Egg, whole, raw, fresh, 50 g)
  item("egg", "Egg", "1 large, 50 g", 50, 72, 6.3, 0.4, 4.8, "breakfast", ["eggs"]),
  // FDC 172183 (Egg, white, raw, fresh, 100 g)
  item("egg-whites", "Egg whites", "100 g", 100, 52, 10.9, 0.7, 0.2, "breakfast", []),
  // FDC 173904 (Cereals, oats, regular and quick, not fortified, dry, 60 g)
  item("oats", "Oats", "60 g dry", 60, 227, 7.9, 40.6, 3.9, "breakfast", ["oatmeal", "porridge"]),
  // FDC 173944 (Bananas, raw, 118 g)
  item("banana", "Banana", "1 medium, 118 g", 118, 105, 1.3, 27, 0.4, "snack", []),
  // FDC 171688 (Apples, raw, with skin, 182 g)
  item("apple", "Apple", "1 medium, 182 g", 182, 95, 0.5, 25.1, 0.3, "snack", []),
  // FDC 170894 (Yogurt, Greek, plain, nonfat, 200 g)
  item("greek-yogurt", "Greek yogurt, nonfat", "200 g", 200, 118, 20.4, 7.2, 0.8, "breakfast", [
    "yoghurt",
    "skyr",
  ]),
  // FDC 172182 (Cheese, cottage, lowfat, 2% milkfat, 200 g)
  item("cottage", "Cottage cheese 2 %", "200 g", 200, 162, 20.9, 9.5, 4.5, "snack", ["curd"]),
  // FDC 171477 (Chicken, broilers or fryers, breast, meat only, cooked, roasted, 100 g)
  item("chicken", "Chicken breast, cooked", "100 g", 100, 165, 31, 0, 3.6, "lunch", []),
  // FDC 171794 (Beef, ground, 90% lean meat / 10% fat, crumbles, cooked, pan-browned, 100 g)
  item("beef", "Lean ground beef, cooked", "100 g", 100, 230, 28.5, 0, 12, "dinner", ["mince"]),
  // FDC 175168 (Fish, salmon, Atlantic, farmed, cooked, dry heat, 100 g)
  item("salmon", "Salmon, cooked", "100 g", 100, 206, 22.1, 0, 12.4, "dinner", []),
  // FDC 173709 (Fish, tuna, light, canned in water, drained solids, 120 g)
  item(
    "tuna",
    "Tuna, canned in water",
    "1 can drained, 120 g",
    120,
    103,
    23.3,
    0,
    1.2,
    "lunch",
    [],
  ),
  // FDC 168878 (Rice, white, long-grain, regular, enriched, cooked, 100 g)
  item("rice", "White rice, cooked", "100 g", 100, 130, 2.7, 28.2, 0.3, "lunch", []),
  // FDC 170440 (Potatoes, boiled, cooked without skin, flesh, without salt, 200 g)
  item("potato", "Potato, boiled", "200 g", 200, 172, 3.4, 40, 0.2, "dinner", ["potatoes"]),
  // FDC 172688 (Bread, whole-wheat, commercially prepared, 40 g)
  item("bread", "Whole-wheat bread", "1 slice, 40 g", 40, 101, 5, 17.1, 1.4, "breakfast", [
    "toast",
  ]),
  // FDC 169737 (Pasta, cooked, enriched, without added salt, 150 g)
  item("pasta", "Pasta, cooked", "150 g", 150, 237, 8.7, 46.3, 1.4, "dinner", []),
  // FDC 171267 (Milk, reduced fat, fluid, 2% milkfat, 254 g = 250 ml)
  item("milk", "Milk 2 %", "250 ml", 254, 127, 8.4, 12.2, 5, "snack", []),
  // FDC 170567 (Nuts, almonds, 30 g)
  item("almonds", "Almonds", "30 g", 30, 174, 6.3, 6.5, 15, "snack", ["nuts"]),
  // FDC 172470 (Peanut butter, smooth style, without salt, 16 g)
  item("peanut-butter", "Peanut butter", "1 tbsp, 16 g", 16, 96, 3.6, 3.6, 8.2, "snack", []),
  // FDC 171413 (Oil, olive, salad or cooking, 14 g)
  item("olive-oil", "Olive oil", "1 tbsp, 14 g", 14, 124, 0, 0, 14, "dinner", ["oil"]),
  // FDC 171890 (Beverages, coffee, brewed, prepared with tap water, 200 g) + 171267 (milk 2 %, 51 g)
  item(
    "coffee-milk",
    "Coffee with milk",
    "1 cup + 50 ml 2 % milk",
    251,
    28,
    1.9,
    2.4,
    1,
    "breakfast",
    ["latte", "cappuccino"],
  ),
  // FDC 168746 (Alcoholic beverage, beer, regular, all, 500 g)
  item("beer", "Beer", "500 ml", 500, 215, 2.3, 17.8, 0, "snack", []),
]

const byName = Order.mapInput(Order.String, (entry: QuickAddItem) => entry.name.toLowerCase())

/** Case-insensitive substring match on name and aliases, sorted by name; "" lists everything. */
export const searchQuickAdd = (query: string): ReadonlyArray<QuickAddItem> => {
  const needle = query.trim().toLowerCase()
  return pipe(
    QUICK_ADD,
    Arr.filter(
      (entry) =>
        entry.name.toLowerCase().includes(needle) ||
        entry.aliases.some((alias) => alias.toLowerCase().includes(needle)),
    ),
    Arr.sort(byName),
  )
}

const roundTenth = (n: number): number => Math.round(n * 10) / 10

/**
 * The catalog row as a `FoodItem` scaled by `multiplier` (×1.5 = 1.5 portions): kcal rounded to an
 * integer, grams to 0.1, so `totalsOf([result])` equals the scaled row.
 */
export const quickAddToFoodItem = (entry: QuickAddItem, multiplier: number): FoodItem => ({
  name: entry.name,
  portion: multiplier === 1 ? entry.portion : `${multiplier} × ${entry.portion}`,
  grams: Option.map(entry.grams, (g) => roundTenth(g * multiplier)),
  kcal: Math.round(entry.kcal * multiplier),
  proteinG: roundTenth(entry.proteinG * multiplier),
  carbsG: roundTenth(entry.carbsG * multiplier),
  fatG: roundTenth(entry.fatG * multiplier),
  fibreG: Option.none(),
  confidence: Option.none(),
})
