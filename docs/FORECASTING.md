# Demand forecasting

## Real-data retraining

Install backend and ML requirements in the Python 3.12 environment. From the repository root, add `backend` to `PYTHONPATH` and run `python -m ml.forecasting.retrain` with the backend database settings available as environment variables. Alternatively, start in `backend`, add the repository root to `PYTHONPATH`, and use the backend's existing `.env` configuration.

A candidate requires at least 300 eligible dishes with matching forecasts, 40 distinct meal dates, and two kitchens. Supervised rows use the forecast's expected attendance. Valid unlinked meals can contribute earlier observations for historical features. The served quantity is prepared quantity minus unserved leftovers.

The model must improve WAPE by more than 2% relative to both catalogue and local-history baselines on validation and test data, with at least 20 evaluated rows per supported unit in each split. When an active model exists, the candidate must also beat its WAPE for every incumbent unit on at least 20 shared, supported test observations per unit strictly after the incumbent's last evaluation date. These are MVP activation thresholds. They can defer replacement until sufficient new feedback accumulates.

Candidates receive unique versions and are registered in PostgreSQL. An advisory transaction lock serializes activation, and the existing partial unique index enforces one active version per model name. Preserve the artifact directory across backend deployments. Joblib artifacts must originate from the local training commands. Saving feedback leaves the active model unchanged.

## Local experiments

Run these commands from the repository root with the project virtual environment active.

```powershell
python -m pip install -r backend/requirements.txt -r ml/requirements.txt
python -m ml.forecasting.inspect_dataset
python -m ml.forecasting.generate_dataset
python -m ml.forecasting.train
python -m ml.forecasting.demo demo-1 2025-06-15 LUNCH "Steamed Rice" 150
```

The inspected workbook and generated CSV live under `ml/datasets/forecasting/`. Training writes separate Joblib bundles, metadata, actual-versus-predicted plots, and `evaluation_results.json` to `ml/artifacts/forecasting/`. The demo CLI only accepts synthetic kitchen identities. The authenticated HTTP API only accepts registered kitchens.

Training splits unique dates 70%/15%/15% in order and fits preprocessing on the training split. Validation and test use observations from strictly earlier dates, including completed meals from earlier in their own split. This measures a walk-forward deployment with ongoing feedback. It assumes linked expected attendance was entered before cooking and earlier-date feedback is available by prediction time. Observational weather and temperature are omitted since forecast-time availability is unverified.

### Observed holdout results

| Dataset and quantity unit | XGBoost MAE | Catalogue MAE | Local history MAE | Trailing 30 MAE |
|---|---:|---:|---:|---:|
| Restaurant, undocumented | 51.09 | | | 50.71 |
| Synthetic institution, serving | 13.45 | 27.36 | 15.40 | |
| Synthetic institution, piece | 34.66 | 64.78 | 38.66 | |

RMSE, WAPE, and R² by split and quantity unit are in the generated evaluation report. Synthetic accuracy describes only the simulator.

## Backend use and verification

Run `python -m alembic upgrade head` from `backend` before serving requests. The forecasting and feedback paths are documented in [the API contract](API_CONTRACT.md). Forecasts use a 90-day prior history window and smoothing constant of 10 by default. They round recommendations upward, then calculate ingredients using the rounded amount. Older forecasts created before the prediction-details migration reconstruct ingredients from the current catalogue and report the missing historical count as null.

From the root with the project environment active:

```powershell
${env:PYTHONPATH} = (Resolve-Path backend).Path
${env:DATABASE_URL} = "sqlite://"
${env:SECRET_KEY} = "local-only-test-secret-at-least-32-bytes"
python -m pytest backend/tests ml/tests
```

The PostgreSQL smoke test is opt-in. From `backend`, use an isolated PostgreSQL database or a database role allowed to create schemas, set `FORECAST_TEST_POSTGRES=1`, and run `python -m pytest tests/test_forecast_postgres.py` with the backend settings loaded. It applies migrations and exercises forecast, feedback, and retraining extraction in a transaction-scoped schema that is rolled back.
