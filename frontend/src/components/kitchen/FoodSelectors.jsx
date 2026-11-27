import { useId, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { Field } from "../ui/Form.jsx";
import {
  FOOD_ROLES,
  classNames,
  labelFor,
  unitLabel,
} from "../../utils/format.js";

const ROLE_ORDER = [...FOOD_ROLES, "OTHER"];

function foodDetail(food) {
  return [
    labelFor(food.food_role, "Unclassified"),
    unitLabel(food.serving_unit),
    food.category,
    food.is_vegetarian ? "Vegetarian" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function groupFoods(foods) {
  const groups = new Map();
  for (const food of foods ?? []) {
    const role = food.food_role ?? "OTHER";
    if (!groups.has(role)) groups.set(role, []);
    groups.get(role).push(food);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => ROLE_ORDER.indexOf(left) - ROLE_ORDER.indexOf(right))
    .map(([role, items]) => ({
      role,
      items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

export function FoodMultiSelect({
  foods,
  selectedIds,
  onChange,
  label = "Food items",
  hint,
  error,
  required = false,
  disabled = false,
  maxHeight = 320,
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedFoods = useMemo(
    () => (foods ?? []).filter((food) => selectedSet.has(food.id)),
    [foods, selectedSet],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return foods ?? [];
    return (foods ?? []).filter((food) =>
      [food.name, food.category, labelFor(food.food_role), food.serving_unit]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [foods, search]);

  function toggle(foodId) {
    if (disabled) return;
    if (selectedSet.has(foodId)) onChange(selectedIds.filter((idValue) => idValue !== foodId));
    else onChange([...selectedIds, foodId]);
  }

  const groups = groupFoods(filtered);

  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      required={required}
      className="k-food-select"
    >
      {selectedFoods.length > 0 ? (
        <div className="k-food-chips" aria-label="Selected food items">
          {selectedFoods.map((food) => (
            <span className="k-food-chip" key={food.id}>
              {food.name}
              <small>{unitLabel(food.serving_unit)}</small>
              <button
                type="button"
                aria-label={`Remove ${food.name}`}
                onClick={() => toggle(food.id)}
                disabled={disabled}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <button
            type="button"
            className="k-food-clear"
            onClick={() => onChange([])}
            disabled={disabled}
          >
            Clear all
          </button>
        </div>
      ) : null}

      <div className="k-food-search">
        <Search size={15} aria-hidden="true" />
        <input
          id={id}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search dishes by name, category or role…"
          disabled={disabled}
        />
        {search ? (
          <button type="button" aria-label="Clear search" onClick={() => setSearch("")}>
            <X size={13} />
          </button>
        ) : null}
      </div>

      <div className="k-food-options" style={{ maxHeight }}>
        {foods == null ? (
          <p className="k-food-empty">Loading the food catalogue…</p>
        ) : groups.length === 0 ? (
          <p className="k-food-empty">No dishes match “{search}”.</p>
        ) : (
          groups.map((group) => (
            <div className="k-food-group" key={group.role}>
              <p className="k-food-group-label">{labelFor(group.role, "Other")}</p>
              {group.items.map((food) => {
                const checked = selectedSet.has(food.id);
                return (
                  <label
                    key={food.id}
                    className={classNames("k-food-option", checked && "is-selected")}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(food.id)}
                      disabled={disabled}
                    />
                    <span className="k-food-check" aria-hidden="true">
                      {checked ? <Check size={12} /> : null}
                    </span>
                    <span className="k-food-option-text">
                      <strong>{food.name}</strong>
                      <small>{foodDetail(food)}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          ))
        )}
      </div>
      <p className="k-hint k-food-count">
        {selectedIds.length} selected · {foods?.length ?? 0} dishes in the catalogue
      </p>
    </Field>
  );
}

export function FoodSelect({
  foods,
  value,
  onChange,
  label = "Food item",
  hint,
  error,
  required = false,
  disabled = false,
  allowAll = false,
  allLabel = "All foods",
  placeholder = "Select a food item",
  className = "",
}) {
  const id = useId();
  const groups = groupFoods(foods ?? []);

  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} required={required} className={className}>
      <select
        id={id}
        className="k-select"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required={required}
        aria-invalid={Boolean(error)}
      >
        <option value="">{allowAll ? allLabel : placeholder}</option>
        {groups.map((group) => (
          <optgroup key={group.role} label={labelFor(group.role, "Other")}>
            {group.items.map((food) => (
              <option key={food.id} value={food.id}>
                {food.name} ({unitLabel(food.serving_unit)})
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </Field>
  );
}

export function FoodBadgeList({ foods, ids, empty = "No dishes" }) {
  const selected = (foods ?? []).filter((food) => ids?.includes(food.id));
  if (selected.length === 0) return <span className="k-muted-text">{empty}</span>;
  return (
    <span className="k-inline-chips">
      {selected.map((food) => (
        <span className="k-inline-chip" key={food.id}>{food.name}</span>
      ))}
    </span>
  );
}
