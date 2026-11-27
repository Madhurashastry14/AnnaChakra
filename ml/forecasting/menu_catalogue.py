"""Defaults for the seed catalogue and simulated kitchens."""
MAIN_DISHES = frozenset({
    "Idli", "Dosa", "Poha", "Upma", "Kuzhi Paniyaram", "Steamed Rice", "Biryani",
    "Lemon Rice", "Curd Rice", "Vegetable Pulao", "Chapati", "Poori", "Paratha",
})
ACCOMPANIMENTS = {
    "Sambar": ("Steamed Rice", "Idli", "Dosa", "Kuzhi Paniyaram"),
    "Dal Tadka": ("Steamed Rice", "Chapati"),
    "Rasam": ("Steamed Rice", "Curd Rice"),
    "Vegetable Curry": ("Chapati", "Poori", "Vegetable Pulao"),
    "Chana Masala": ("Chapati", "Paratha", "Poori"),
    "Palak Paneer": ("Chapati", "Steamed Rice"),
}


def seed_role(name):
    if name in MAIN_DISHES:
        return "MAIN_DISH"
    if name in ACCOMPANIMENTS:
        return "ACCOMPANIMENT"
    return "SIDE_DISH" if name == "Aloo Gobi" else None
