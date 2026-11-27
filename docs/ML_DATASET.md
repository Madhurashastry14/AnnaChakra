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
