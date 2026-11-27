# Menu-aware demand forecasting

## Catalogue and forecasting behavior

From `backend`, apply `python -m alembic upgrade head` and run `python -m scripts.seed_food_items`. The seed command adds missing foods and classifies existing unclassified seed items by name while preserving IDs and existing classifications. Administrators can adjust roles, compatibility, uptake, and preference weights through the catalogue API.

Choice menus allocate every expected attendee to exactly one main dish. Catalogue weights default to equal shares. Largest-remainder ties follow the requested dish order. Fixed meals allocate all expected attendees to each main. Non-main uptake defaults to 75% and can be configured per dish. A compatible accompaniment uses the pooled diners from its matching selected mains. Fixed meals count each eligible diner once per accompaniment. With configured compatibility and no match, the accompaniment gets zero. Without configured compatibility, the estimate applies its uptake to total attendance and includes a warning. Unclassified items are treated as mains for forecasting and flagged in the response.

Historical choice preference uses served amounts divided by each historical catalogue portion. It prioritizes exact menus for the meal type, then similar competing mains for the meal type, then broader choice history for the same kitchen. The lookback is 90 days and the default smoothing constant is 10. Incomplete, shortage-affected, fixed-mode, unknown-mode, and zero-attendance meals do not contribute to choice shares. A complete legacy single-dish meal can inform the serving rate for a future single main. Any inferred diner equivalents are based on aggregate portions.

## Local experiments

From the repository root with the Python 3.12 environment active:

```powershell
python -m pip install -r backend/requirements.txt -r ml/requirements.txt
python -m ml.forecasting.generate_dataset
python -m ml.forecasting.train --experiment menu
python -m ml.forecasting.demo demo-1 2025-06-15 LUNCH Chapati 200 --with "Steamed Rice" --with Sambar
```

The generated CSV stays in `ml/datasets/forecasting/`. The local output in `ml/artifacts/forecasting/` includes `menu_demo_model.joblib`, `menu_demo_metadata.json`, `menu_evaluation_results.json`, and the actual-versus-predicted plot. Use `--experiment restaurant` for the independent restaurant sales experiment or `--experiment all` for both.

Training splits unique dates 70%/15%/15% in chronological order and fits preprocessing on the training partition. All dishes from a meal stay together. Walk-forward evaluation assumes prior-date feedback is available and linked forecasts contain genuinely pre-meal attendance estimates. The model learns choice shares for competing mains and effective diner-equivalent rates for other dishes. Choice scores are normalized before allocation. An accompaniment's recipients are capped by the model's corresponding main allocation.

### Seed 42 synthetic test holdout

| Quantity unit | Independent MAE | Equal allocation MAE | Kitchen history MAE | XGBoost MAE |
|---|---:|---:|---:|---:|
| Piece | 159.09 | 40.59 | 24.62 | 18.32 |
| Serving | 58.78 | 17.46 | 9.90 | 7.41 |

Mean absolute choice-share error was 0.1032 for equal allocation, 0.0531 for kitchen history, and 0.0348 for XGBoost. XGBoost, equal allocation, and kitchen history each had zero violations across 394 choice meals. Independent allocation exceeded attendance in 357. The generated report includes RMSE, WAPE, and per-dish results. These results describe simulated kitchens.

## Real-data retraining

Run `python -m ml.forecasting.retrain` from the root with `backend` on `PYTHONPATH` and the database settings in the environment. Alternatively, run from `backend` with the project root on `PYTHONPATH` and the existing backend settings.

A candidate requires at least 300 eligible dishes from linked forecasts, 40 distinct meal dates, and two kitchens. Eligible manual feedback can contribute prior history. It does not provide supervised rows because it has no forecasted attendance. Known serving mode and complete, classified, uncensored menus are required. Feedback writes do not trigger training.

Promotion requires zero ML choice-allocation violations and more than 2% lower WAPE than each baseline on validation and test, with at least 20 observations per supported unit in each split. A compatible incumbent must also be beaten on at least 20 shared, fresh test observations per incumbent unit, after its last evaluation date. The registry uses the `institutional_menu_demand` name and serializes promotion under a PostgreSQL advisory lock. The earlier independent-dish registry remains separate. Retain versioned artifacts on trusted local storage. Use `python -m ml.forecasting.retrain --rollback VERSION` to restore a previously active, eligible menu-model artifact.

## Backend verification

See the additive fields in the [API contract](API_CONTRACT.md). Use the existing ML and backend test suites from the repository root with `backend` on `PYTHONPATH` and local test database settings. The opt-in PostgreSQL smoke test applies the migration chain and exercises forecast and feedback endpoints in a rollback-only schema. Run `python -m pytest tests/test_forecast_postgres.py` from `backend` with `FORECAST_TEST_POSTGRES=1` and a PostgreSQL role allowed to create schemas.

## Planning before forecasting

The smart menu endpoint proposes an editable set of catalogue foods using kitchen feedback and compatibility rules. The selected menu still uses the existing forecasting endpoint for cooking quantities. Synthetic training reports describe the simulation rather than measured institutional forecasting accuracy. [Menu planning guide](WASTE_INTELLIGENCE.md).
