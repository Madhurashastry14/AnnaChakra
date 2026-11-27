# Forecasting datasets

## Restaurant workbook

Run `python -m ml.forecasting.inspect_dataset` from the repository root to inspect the local workbook supplied as a Kaggle download. The original dataset URL, collection method, and whether records are observed or simulated remain unverified.

The workbook has 1,000 rows and 16 columns, covering five restaurant IDs and 12 food items from January 2 to December 31, 2025. Inspection found no missing fields, exact duplicates, invalid dates, or negative quantities. Prepared quantity equals sold plus remaining on every row. In 69 rows, all positive prepared quantity was sold. Those observations may understate latent demand.

| Field | Minimum | Median | Maximum |
|---|---:|---:|---:|
| Prepared_Quantity | 50 | 177 | 300 |
| Sold_Quantity | 18 | 139 | 294 |
| Remaining_Quantity | 0 | 33 | 112 |
| Waste_Amount_kg | 0 | 8.375 | 34.06 |

The waste column label specifies kilograms. Units for prepared, sold, and remaining quantities are undocumented. The workbook contains restaurant sales and current customer counts. It cannot establish institutional serving rates or forecast performance for a registered kitchen.

## Synthetic institutional records

Run `python -m ml.forecasting.generate_dataset` from the repository root. The fixed-seed simulation generates 180 days of menus and quantities for eight demo kitchens and labels each row as synthetic. It writes a local CSV under the ignored forecasting datasets directory. Meals include a unique menu ID, serving mode, catalogue roles, complete composition, compatibility, and simulated selected diners. In choice meals the main dishes partition actual attendance. Selected-diner counts are synthetic ground truth and are excluded from inference features.

Served quantity equals prepared quantity minus unserved leftovers. For supervised training, exclude shortages and zero-attendance meals. Evaluation on synthetic data demonstrates pipeline functionality. Real-world forecasting accuracy requires representative, compatible records from actual institutional kitchens.
