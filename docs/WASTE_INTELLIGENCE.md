# Waste intelligence and menu planning

## Run locally

Use Python 3.12. From the repository root, install `backend/requirements.txt` and `ml/requirements.txt`. Install `ml/vision/requirements.txt` to enable local OpenCV counting and TensorFlow recognition. OpenCV and TensorFlow load on demand. Missing vision dependencies or artifacts leave staff workflows available. Preserve the existing model, metadata and class mapping under `ml/artifacts/vision/`. [Vision setup and food safety policy](VISION_WASTE.md).

From `backend`, run:

```powershell
python -m alembic current
python -m alembic heads
python -m alembic upgrade head
python -m alembic check
python -m scripts.seed_food_items
python -m uvicorn app.main:app --reload
```

The meal-type migration only backfills the named standard dishes. Configure `supported_meal_types` through the admin catalogue API for other dishes. Missing or empty meal-type support excludes the food from automatic proposals. Existing forecasts and meal feedback remain usable with those dishes.

From the repository root, run:

```powershell
$env:PYTHONPATH = (Resolve-Path backend).Path
$env:DATABASE_URL = "sqlite://"
$env:SECRET_KEY = "local-test-key-at-least-32-bytes"
python -m pytest --basetemp ml/artifacts/vision/local-tests backend/tests ml/tests
```

For the opt-in PostgreSQL checks, run from `backend` with local backend database settings and `FORECAST_TEST_POSTGRES=1`. Use a database role allowed to create test schemas. Run `python -m pytest tests/test_forecast_postgres.py tests/test_waste_concurrency_postgres.py`.

## Kitchen workflow

1. Ask for a menu recommendation. Review the item evidence, accept or customize the proposed foods, and submit the final menu to the existing forecast endpoint.
2. Use the forecast's recommended cooking quantities and ingredient requirements. Record actual attendance, prepared quantities, unserved leftovers, and plate waste after the meal.
3. Open the meal's waste summary to get prefilled drafts. If there is unlogged unserved surplus, review the surplus drafts and missing safety evidence. A missing plate-waste measurement stays unknown.
4. Optionally upload a photo. Prefill the recognized food and any compatible visible-piece estimate. If staff changes food identity, clear the old quantity suggestion and use manual entry or request a fresh count for the chosen food.
5. Explicitly confirm the food, quantity, category, and optional meal association before saving. Image-first and manual logs also work. The authoritative meal record stays the source of forecasting feedback.
6. Complete safety screening on unserved surplus. Only confirmed, unexpired records that pass the existing configured screen show positive availability for future matching.
7. Review trends, insights, and portion or preparation recommendations before planning the next menu.

A draft is a read-only suggestion. Linked spoiled food shares the unserved balance. Linked plate waste has a separate balance. Measured plate waste limits logging. An unknown plate-waste balance never becomes zero by inference. An existing image can support one current waste log per kitchen. Reuploads of the same newly ingested decoded pixels use the same duplicate guard, including concurrent requests. Different crops or encodings that change decoded pixels and unrelated manual entries cannot be matched reliably.

For reconciliation, use the meal summary to locate the linked logs. If staff entered the wrong association, use the log's PATCH to detach an editable association, correct the authoritative meal feedback, then relink or reconcile the confirmed quantities. Donation-protected records remain protected and need an operational review if normal edits return 409. The system keeps a direct link between quantities and their source while attached.

## Visible-piece counting

Automatic counts require a catalogue-mapped piece-based classification at or above the configured vision threshold. The existing model recognizes Chapati and Kuzhi Paniyaram among the countable classes. Staff can explicitly select Chapati, Kuzhi Paniyaram, Idli, Poori, or Dosa from the catalogue and request a count for the same private image. Bulk food and unresolvable photos require manual quantity entry.

The contour heuristic uses a resized LAB image, border background modeling, Gaussian smoothing, Otsu segmentation, morphology, connected components, and area, shape, and clipping checks. Bounding boxes are normalized to the oriented image. Use bright images with a plain contrasting background and separated pieces. The service abstains on ambiguous masks. Stacks, touching edges, perspective, shadows, and containers can cause undercounting or abstention. Scores from the food classifier are unrelated to count reliability. Counts estimate visible pieces only and have no calibrated confidence score. Images cannot establish food safety.

The deterministic three-shape fixture returned three, with absolute error zero. Empty, dark and overlapping synthetic inputs returned no estimate. A spot check of a real held-out Kuzhi Paniyaram photo had seven visually identifiable pieces in a dark pan with overlaid text. The algorithm abstained, so an absolute count error cannot be calculated for that image. Neither result establishes accuracy on institutional kitchen photos. Synthetic forecasting evaluations also do not establish real-world forecasting accuracy.

## Analytics and planning logic

Metrics group one food and serving unit by meal type and menu mode. Trends additionally group by date. Default history is 90 days through today. Historical recommendation data stops before the target meal date. Unserved rate is weighted by preparation quantity. Plate-waste rate and the consumption-based food acceptance proxy use served quantity from measured records only. Efficiency uses prepared quantity from the same measured records. Confirmed shortages remain visible as planning risk. Food acceptance is a consumption proxy and does not measure individual diner choices.

Waste insights use configurable `WASTE_*` heuristics. Defaults include five comparable records, 80% plate-waste coverage, 15% surplus and plate-waste review thresholds, and a 20% shortage flag. These are application heuristics. A high plate-waste result flags portion review; it does not lower the forecast or update the catalogue. Use `forecast_id` with the portion endpoint to compare against the stored menu-aware preparation quantity and comparable historical menus. Shortage-censored rows are excluded from per-attendee demand evidence.

Menu scores are rule-based, with five configurable `MENU_SCORE_WEIGHTS` in this order: measured acceptance proxy (30%), low unserved surplus (25%), low plate waste (25%), recent menu variety (10%), and low shortage risk (10%). Related choice menus can contribute a small adjustment from aggregate diner-equivalent evidence. Historical rates shrink toward catalogue weights, unmeasured rates retain their priors, and uncensored quantity metrics use a 45-day recency half-life. Variety uses the previous 14 days. Shortages affect operational risk separately from acceptance. The deterministic shortlist respects meal types, vegetarian requirements, exclusions, requirements, roles, and dish limits. Accompaniments need a compatible selected main. Fixed menus favor observed main combinations when available. Staff can edit any proposed menu before submitting a forecast. Genuine kitchen history is needed for stronger advice.

The recommendation and analytics endpoints do not create forecasts, meal records, donations, or offers. [Frontend API contract](API_CONTRACT.md).
