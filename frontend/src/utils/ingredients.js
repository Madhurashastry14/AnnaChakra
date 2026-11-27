const DIMENSIONS = {
  g: { dimension: "mass", factor: 1, base: "g" },
  kg: { dimension: "mass", factor: 1000, base: "g" },
  ml: { dimension: "volume", factor: 1, base: "ml" },
  l: { dimension: "volume", factor: 1000, base: "ml" },
  piece: { dimension: "count", factor: 1, base: "piece" },
};

function normalizeName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function displayQuantity(quantity, dimension) {
  if (dimension === "mass") {
    if (quantity >= 1000) return { quantity: Math.round((quantity / 1000) * 1000) / 1000, unit: "kg" };
    return { quantity: Math.round(quantity * 100) / 100, unit: "g" };
  }
  if (dimension === "volume") {
    if (quantity >= 1000) return { quantity: Math.round((quantity / 1000) * 1000) / 1000, unit: "l" };
    return { quantity: Math.round(quantity * 100) / 100, unit: "ml" };
  }
  return { quantity: Math.round(quantity * 100) / 100, unit: "piece" };
}

/**
 * Combine ingredients with compatible names and compatible units.
 * Weight and volume are never combined. Counts remain separate.
 *
 * @param {Array<{ingredients?: Array<{name:string, quantity:number, unit:string}>}>} dishes
 * @returns {Array<{name:string, quantity:number, unit:string, dimension:string}>}
 */
export function consolidateIngredients(dishes) {
  const merged = new Map();

  for (const dish of dishes ?? []) {
    for (const ingredient of dish?.ingredients ?? []) {
      const unit = DIMENSIONS[ingredient?.unit];
      const quantity = Number(ingredient?.quantity);
      if (!unit || !Number.isFinite(quantity) || quantity <= 0) continue;

      const key = `${normalizeName(ingredient.name)}::${unit.dimension}`;
      const existing = merged.get(key);
      if (existing) {
        existing.baseQuantity += quantity * unit.factor;
      } else {
        merged.set(key, {
          name: String(ingredient.name).trim(),
          dimension: unit.dimension,
          baseQuantity: quantity * unit.factor,
        });
      }
    }
  }

  return [...merged.values()]
    .map((item) => {
      const display = displayQuantity(item.baseQuantity, item.dimension);
      return {
        name: item.name,
        dimension: item.dimension,
        quantity: display.quantity,
        unit: display.unit,
      };
    })
    .sort((a, b) => a.dimension.localeCompare(b.dimension) || a.name.localeCompare(b.name));
}
