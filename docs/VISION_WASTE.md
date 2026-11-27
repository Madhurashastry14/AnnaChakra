# Food recognition, waste logging, and redistribution screening

## Installation and model artifacts

From the project root with Python 3.12 active:

```powershell
python -m pip install -r backend/requirements.txt -r ml/vision/requirements.txt
python -m ml.vision.inspect_dataset
python -m ml.vision.train --epochs 6
python -m ml.vision.evaluate
python -m ml.vision.predict ml/datasets/vision/chapati/00d4263b19.jpg
```

Training downloads official Keras ImageNet MobileNetV2 weights on first use. Place the local dataset in `ml/datasets/vision/` with one class folder per label. [Dataset inspection and licensing notes](VISION_DATASET.md).

The default local directory is `ml/artifacts/vision/`. Generate `food_classifier.keras`, `class_names.json`, and `vision_metadata.json` together. The API can point to any operator-controlled directory via `VISION_ARTIFACT_DIR`. Deploy those three files as a trusted set. Keep training history, the evaluation report and plots, and the split and inspection manifests for reproducibility. The backend can run with Pillow alone and accept valid uploads for manual logging when TensorFlow or the trained artifacts are unavailable. Datasets, checkpoints, and uploads are ignored by Git.

Other backend settings include `VISION_UPLOAD_DIR` for private durable storage, `VISION_MAX_BYTES` (5 MiB), `VISION_MAX_PIXELS` (20 million), and `VISION_CONFIDENCE_THRESHOLD` (0.65). Use authenticated image retrieval. When deploying multiple application instances, use storage accessible to all instances. Configure a deployment-specific retention policy for accepted uploads and abandoned references. Failed upload transactions remove files created by that request. A rejected waste write leaves the valid earlier upload intact for correction and retry.

From `backend`, use the configured development database and run `python -m alembic upgrade head`, `python -m alembic check`, then `python -m uvicorn app.main:app --reload`. See the [API contract](API_CONTRACT.md#6-computer-vision-and-waste-logging-kitchen-ui) for frontend requests and validation.

## Measured held-out performance

The frozen ImageNet MobileNetV2 trained on CPU for 70.8 seconds over six epochs. The held-out test had 48 images. Accuracy was 79.17%, macro precision 85.18%, macro recall 79.17%, and macro and weighted F1 both 78.97%. Poha → aloo gobi and aloo gobi → chana masala were the most frequent errors, at two each. The final training and validation accuracies were 82.30% and 83.33%. Training and validation loss were 0.570 and 0.640.

The downloaded images depict recognizable dishes. Mixed leftovers, poor lighting, and large containers can degrade performance. Model scores are uncalibrated closed-set probabilities. Staff must confirm or correct the dish and independently verify variants, dietary information, and allergens. Staff enter the quantity. Image classification cannot establish weight, serving count, freshness, or safe handling.

Each class had six test images.

| Class | Precision | Recall | F1 |
|---|---:|---:|---:|
| Aloo gobi | 50.0% | 66.7% | 57.1% |
| Biryani | 100.0% | 83.3% | 90.9% |
| Chana masala | 60.0% | 100.0% | 75.0% |
| Chapati | 100.0% | 83.3% | 90.9% |
| Dal tadka | 100.0% | 100.0% | 100.0% |
| Kuzhi paniyaram | 100.0% | 83.3% | 90.9% |
| Palak paneer | 71.4% | 83.3% | 76.9% |
| Poha | 100.0% | 33.3% | 50.0% |

## Kitchen workflow

1. Upload a JPEG, PNG, or WebP and show a progress state while recognition runs.
2. Display up to three suggestions if available. Allow a catalogue search and correction regardless of confidence. An unavailable model still permits manual selection or a log without any image.
3. Enter a positive confirmed quantity in the catalogue unit. Pieces require whole numbers.
4. Select the waste type. Optionally associate the matching dish from completed meal feedback and include preparation and storage evidence.
5. Save the log. Show its rule-based screening status and reasons. Use an explicit safety check to submit updated evidence.
6. Treat eligible, unexpired surplus as a candidate for a future matching workflow.

## Redistribution policy

FSSAI's 2019 surplus food regulation defines eligible surplus as unused, unserved food and requires safe handling and distribution within its shelf life. The schedules cover handling, suitable storage temperatures, and traceability. Schedule I specifically addresses refrigerator temperature for distribution organisations. The app implements a conservative refrigerated ceiling below the stated threshold as a configuration validation guard. Food-specific shelf life and other operating limits still require an approved policy. [FSSAI Gazette notification](https://www.fssai.gov.in/upload/uploadfiles/files/Gazette_Notification_Surplus_Food_06_08_2019.pdf).

By default no policy is configured. Set `SAFETY_POLICY_PATH` to a private JSON file only when your food safety lead has approved applicable local limits and evidence requirements. The file accepts `version`, `authority_reference`, `blocked_foods`, and `rules` keyed by lowercase catalogue name. Each rule requires `storage_method`, `max_holding_minutes`, `max_uncontrolled_minutes`, `max_measurement_age_minutes`, and at least one of `min_temperature_c` or `max_temperature_c`. Refrigerated policies require a maximum below 7 °C. Supply validated values and a traceable authority reference. Update the version when changing rules. There is no universal default time/temperature schedule.

The screen requires verified kitchen status, evidence that food was unserved, confirmed handling and storage, a known contamination status, preparation time, time outside controlled storage, and documented temperature history from preparation to the latest measurement. The staff-supplied history reference must point to an actual holding record. The software checks declarations and bounds. It cannot audit an external thermometer or log. A single current reading cannot qualify. The earliest approved holding deadline, evidence freshness deadline, and any shorter recorded discard deadline limit availability.

`PENDING` requires more evidence, a verified kitchen, an approved policy, or a fresh screen. `INELIGIBLE` includes plate waste, spoiled food, contamination, failed limits, and expiration. `ELIGIBLE` means the record passed the configured screen. It does not certify food as safe. Reads recheck current policy, kitchen status, and expiration. Persisted legacy evidence stays intact and cannot confer eligibility. No matching, dispatch, receipt, or donation management is implemented here.

Future donation code must lock the waste row, call `screening_for_use` with fresh kitchen and evidence state immediately before matching, dispatch, and receipt, and enforce current availability and reservation totals transactionally. Existing reservations and completed donations block quantity, food, type, timestamp, or reference changes. Safety evidence can still downgrade availability without altering those historical allocations.
