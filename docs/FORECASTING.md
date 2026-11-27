# Demand forecasting

## Real-data retraining

Install backend and ML requirements in the Python 3.12 environment. From the repository root, add `backend` to `PYTHONPATH` and run `python -m ml.forecasting.retrain` with the backend database settings available as environment variables. Alternatively, start in `backend`, add the repository root to `PYTHONPATH`, and use the backend's existing `.env` configuration.

A candidate requires at least 300 eligible dishes with matching forecasts, 40 distinct meal dates, and two kitchens. Supervised rows use the forecast's expected attendance. Valid unlinked meals can contribute earlier observations for historical features. The served quantity is prepared quantity minus unserved leftovers.

The model must improve WAPE by more than 2% relative to both catalogue and local-history baselines on validation and test data, with at least 20 evaluated rows per supported unit in each split. When an active model exists, the candidate must also beat its WAPE for every incumbent unit on at least 20 shared, supported test observations per unit strictly after the incumbent's last evaluation date. These are MVP activation thresholds. They can defer replacement until sufficient new feedback accumulates.

Candidates receive unique versions and are registered in PostgreSQL. An advisory transaction lock serializes activation, and the existing partial unique index enforces one active version per model name. Preserve the artifact directory across backend deployments. Joblib artifacts must originate from the local training commands. Saving feedback leaves the active model unchanged.
