"""Menu-level allocation shared by the API, training, and inference."""
from dataclasses import dataclass
from fractions import Fraction
from math import isfinite

CHOICE = "CHOICE_BASED"
FIXED = "FIXED_MEAL"
MAIN = "MAIN_DISH"
ACCOMPANIMENT = "ACCOMPANIMENT"


@dataclass(frozen=True)
class Dish:
    key: str
    role: str | None
    portion: float
    uptake: float = 0.75
    weight: float = 1
    compatible: tuple[str, ...] = ()

    @property
    def is_main(self):
        return self.role in (None, MAIN)


@dataclass(frozen=True)
class Allocation:
    quantity: float
    diners: int | float | None
    share: float | None
    method: str
    warnings: tuple[str, ...] = ()
    history_count: int = 0


def normalize(weights):
    largest = max(weights.values(), default=0)
    if largest <= 0:
        return dict.fromkeys(weights, 1 / len(weights)) if weights else {}
    scaled = {key: value / largest for key, value in weights.items()}
    total = sum(scaled.values())
    return {key: value / total for key, value in scaled.items()}


def allocate_diners(attendance, shares):
    if not shares:
        return {}
    weights = {key: Fraction(str(value)) for key, value in shares.items()}
    total = sum(weights.values())
    quotas = {key: attendance * value / total for key, value in weights.items()}
    allocated = {key: int(value) for key, value in quotas.items()}
    remainder = sorted(quotas, key=lambda key: quotas[key] - allocated[key], reverse=True)
    for key in remainder[:attendance - sum(allocated.values())]:
        allocated[key] += 1
    return allocated


def choice_priors(dishes):
    weights = {dish.key: dish.weight for dish in dishes if dish.is_main}
    invalid = any(not isfinite(value) or value <= 0 for value in weights.values())
    return normalize(dict.fromkeys(weights, 1) if invalid else weights), invalid


def recipient_pool(dish, attendance, mains, mode):
    matches = [key for key in dish.compatible if key in mains]
    if not dish.compatible:
        return attendance
    if mode == FIXED:
        return attendance if matches else 0
    return sum(mains[key] for key in matches)


def forecast_menu(dishes, attendance, mode, *, shares=None, preference_count=0, rates=None):
    if attendance < 0 or not dishes or len({dish.key for dish in dishes}) != len(dishes):
        raise ValueError("A menu needs distinct dishes and nonnegative attendance")
    if mode not in (CHOICE, FIXED):
        raise ValueError("Unsupported menu serving mode")
    priors, invalid_weights = choice_priors(dishes)
    choices = shares if shares is not None else priors
    mains = allocate_diners(attendance, choices) if mode == CHOICE else dict.fromkeys(priors, attendance)
    results = {}
    for dish in dishes:
        warnings = []
        if not isfinite(dish.portion) or dish.portion <= 0:
            raise ValueError("Catalogue serving portions must be finite and positive")
        if dish.role is None:
            warnings.append("Food role is unclassified. Treated as a main dish.")
        if not mains:
            warnings.append("Menu has no classified or assumed main dish.")
        rate, count = (rates or {}).get(dish.key, (None, 0))
        if dish.is_main:
            diners = mains[dish.key]
            share = choices[dish.key] if mode == CHOICE else None
            method = "FIXED_ATTENDANCE" if mode == FIXED else (
                "HISTORICAL_PREFERENCE" if preference_count else "CATALOGUE_PRIOR"
            )
            if mode == CHOICE and invalid_weights:
                warnings.append("Invalid preference weights. Used equal catalogue priors.")
            if mode == CHOICE and not diners:
                warnings.append("No diners allocated to this main dish.")
            quantity = diners * (rate if rate is not None else dish.portion)
            results[dish.key] = Allocation(quantity, diners, share, method, tuple(warnings),
                                           preference_count if mode == CHOICE and preference_count else count)
        else:
            uptake = dish.uptake
            if not isfinite(uptake) or not 0 <= uptake <= 1:
                uptake = 0.75
                warnings.append("Invalid uptake rate. Used the default uptake of 0.75.")
            if dish.role == ACCOMPANIMENT:
                pool = recipient_pool(dish, attendance, mains, mode)
                method = "COMPATIBLE_MAIN_UPTAKE"
                if not dish.compatible:
                    warnings.append("No compatible main dishes configured. Applied uptake to total attendance.")
                elif not any(key in mains for key in dish.compatible):
                    warnings.append("No compatible main dish selected. Estimated demand is zero.")
            else:
                pool = attendance
                method = "ATTENDANCE_UPTAKE"
            recipients = pool * (rate if rate is not None else uptake)
            results[dish.key] = Allocation(recipients * dish.portion, recipients, None,
                                           method, tuple(warnings), count if pool else 0)
    return results
