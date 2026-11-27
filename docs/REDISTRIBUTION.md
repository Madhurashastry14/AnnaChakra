# NGO matching and redistribution API

All routes below have the `/api/v1` prefix and require the existing bearer token. Kitchen and NGO actions are scoped to the profile associated with that user. Read routes return 404 for inaccessible records and action routes return 403 for the wrong role. Administrators can monitor records and aggregates. They cannot impersonate parties to move a donation through its lifecycle.

## Requirements and matching

| Method and path | Role | Request and result |
|---|---|---|
| POST /ngo-requirements | NGO | Requirement object below. Returns the saved requirement with 201. |
| GET /ngo-requirements | NGO | Returns the NGO's requirement array. |
| GET /ngo-requirements/{id} | NGO | Returns one owned requirement. |
| PATCH /ngo-requirements/{id} | NGO | Partial update of the create fields. Returns the updated requirement. |
| DELETE /ngo-requirements/{id} | NGO | Soft-close, 204. Accepted donations can continue through their existing deadline. |
| GET /waste-logs/available-surplus | Verified kitchen | Returns the kitchen's eligible batch array. |
| POST /matches | Verified kitchen | Returns ranked alternatives without making a reservation. |

Requirement request example. Choose the current business date and a future deadline for a live demo.

```json
{"people_to_feed":40,"capacity_servings":50,"capacity_pieces":80,"accepted_categories":["bread","rice"],"accepts_vegetarian":true,"accepts_non_vegetarian":false,"required_date":"2026-11-28","available_until":"2026-11-28T20:00:00+05:30","is_active":true}
```

Responses include the same fields plus `id`, `ngo_id`, `created_at`, `updated_at`, `remaining_capacity_by_unit` and legacy `remaining_capacity` (the serving pool only). For example, `"remaining_capacity_by_unit":{"piece":60,"serving":50}`. A new requirement uses separate capacity pools. Before the capacity migration, a legacy row's existing remaining balance is treated as its serving ceiling and has zero piece capacity. Review legacy totals before accepting new offers. Actual people and dish quantities are independent.

Dates are interpreted in `REDISTRIBUTION_TIMEZONE` (default `Asia/Kolkata`). Only today's active requirement is matched. A future requirement is recorded and becomes matchable on its required date. An empty category list accepts all categories allowed by the dietary flags. Category names are trimmed and case-insensitive. Capacity reductions below reserved or received quantities return 409. Date or diet changes that could invalidate accepted allocations also return 409. `remaining_capacity`, IDs, and timestamps cannot be edited by clients.

An available item includes `waste_log_id`, `food_item_id`, `food_name`, `serving_unit`, `is_vegetarian`, `confirmed_quantity`, `reserved_quantity`, `available_quantity`, `safety_status`, `safe_until`, `remaining_eligible_seconds`, `safety_policy_version`, and `is_simulated`. The service rechecks the current policy, verification, compatible environment, and batch holding evidence on every read.

Match request example:

```json
{"waste_log_ids":[8],"max_distance_km":15}
```

Alternatively send `{"items":[{"waste_log_id":8,"offered_servings":25}]}` with the optional distance limit. The response is `{"items":[...],"total":1}`. Each alternative gives the NGO and requirement IDs, name, address, coordinates, `distance_km`, `estimated_travel_minutes`, `people_to_feed`, the remaining capacity fields, `suggested_allocation`, `match_score`, `score_components`, `reasons`, `safe_until`, `available_until`, and `is_simulated`. An allocation example is `{"waste_log_id":8,"food_item_id":3,"food_name":"Chapati","serving_unit":"piece","offered_servings":15,"safe_until":"2026-11-28T19:45:00+05:30"}`. The allocation for each NGO is an independent alternative. It may be smaller than the amount requested. Recheck availability by submitting the offer.

Distance is straight-line Haversine. Estimated handoff time is `ceil(60 × distance × MATCH_ROAD_FACTOR / MATCH_SPEED_KMH) + MATCH_HANDLING_MINUTES`. Defaults are road factor 1.6, speed 20 km/h, handling buffer 15 minutes and maximum straight-line range 25 km. This is an operational estimate. Verify an actual route and transport capability before moving food.

Hard filters include verification, environment, current batch safety, diet/category, remaining capacity by unit, and feasibility against both deadlines. Score components are normalized 0–100. Default `MATCH_WEIGHTS` are 35% proximity, 30% share of requested batches that can receive an allocation, 20% urgency, and 15% mean fraction of participating unit capacity used. Proximity is `1 - distance/limit`; urgency is `max(0, 1 - minutes_until_earliest_deadline/180)`. Ties use NGO ID then requirement ID. These are heuristics and scores are not probabilities.

## Donation offers and delivery

| Method and path | Role | Body / result |
|---|---|---|
| POST /donations | Verified kitchen | Offer below. Returns donation with status PENDING, 201. |
| GET /donations | Kitchen, NGO, admin | Scoped array. Supports `status`, `date_from`, `date_to`, `expired_only`, `failed_only`, `limit`, `offset`. Admins can also filter by `kitchen_id` and `ngo_id`. |
| GET /donations/{id} | Kitchen, NGO, admin | One scoped donation with delivery and items. |
| POST /donations/{id}/accept | Intended NGO | No body. PENDING → ACCEPTED. |
| POST /donations/{id}/reject | Intended NGO | `{"reason":"No compatible storage"}`. PENDING → REJECTED. |
| POST /donations/{id}/cancel | Participant | `{"reason":"Kitchen closed"}`. PENDING/ACCEPTED/ASSIGNED → CANCELLED. |
| POST /donations/{id}/assign-delivery | Owning kitchen | `{"delivery_person_id":1,"notes":"Kitchen counter pickup"}`. ACCEPTED → ASSIGNED. Legacy alias `/assign`. |
| POST /donations/{id}/dispatch | Owning kitchen | No body. ASSIGNED → IN_TRANSIT. |
| POST /donations/{id}/delivered | Owning kitchen | No body. IN_TRANSIT → DELIVERED after current checks. |
| POST /donations/{id}/confirm-receipt | Intended NGO | Inspection and receipt body below. DELIVERED → COMPLETED. Legacy alias `/confirm`. |
| POST /donations/{id}/report-failure | Participant | `{"reason":"Unsafe transport conditions"}`. IN_TRANSIT/DELIVERED → CANCELLED with failure timestamp. |
| GET /deliveries | Kitchen, NGO, admin | Scoped delivery array with `limit` and `offset`. |
| GET /deliveries/{id} | Kitchen, NGO, admin | One scoped delivery. |
| POST /deliveries/{id}/dispatch | Owning kitchen | Same dispatch action. Returns updated delivery. |
| POST /deliveries/{id}/mark-delivered | Owning kitchen | Same delivered action. Returns updated delivery. |

Donation request and abbreviated response:

```json
{"requirement_id":1,"items":[{"waste_log_id":8,"offered_servings":25}],"notes":"Pickup at the kitchen counter"}
```

```json
{"id":12,"kitchen_id":4,"kitchen_name":"Canteen","ngo_id":5,"ngo_name":"Community Kitchen","requirement_id":1,"status":"PENDING","items":[{"id":24,"waste_log_id":8,"food_item_id":3,"food_name":"Chapati","serving_unit":"piece","offered_servings":25,"received_servings":null,"receipt_evidence":null}],"delivery":null,"accepted_at":null,"completed_at":null,"expired":false,"is_simulated":false}
```

Donation action results have the same shape. The full response adds addresses, notes, match score when present, reason fields, and timestamps including creation, update, expiry, acceptance, completion, and failure. Delivery contains `id`, `donation_id`, `delivery_person_id`, `delivery_person_name`, `status`, `assigned_at`, `dispatched_at`, `delivered_at`, and `notes`.

`offered_servings` and `received_servings` are quantities in the item's catalogue unit despite the legacy key names. Piece quantities require whole numbers. Missing, inaccessible, or unowned batches and drivers return 404. Invalid bodies including duplicate IDs return 422. Invalid transitions, unavailable or unsafe batches, and capacity conflicts return 409.

Offers reserve food and capacity atomically. Pending holds stop when their effective expiry is reached. The deadline is the earliest of `OFFER_EXPIRY_MINUTES` (30 by default), the NGO deadline minus handoff time, and the batch deadline minus handoff time. Expired offers read as CANCELLED with `expired: true`; no background expiry worker is needed. Rejection and pre-dispatch cancellation release both holds. After dispatch, a failure releases the NGO capacity but permanently holds the offered food from new redistribution. A completed record charges the NGO only for the quantity received and keeps the entire original amount out of available surplus. Repeating an action after its transition returns 409.

Submit a receipt like the example below. Use the batch's actual history and a temperature measurement taken at or after the recorded delivery time. Quantities below the offer require a rejection reason. Send one inspected line for each offered batch.

```json
{
  "inspected": true,
  "items": [{
    "donation_item_id": 24,
    "received_servings": 20,
    "rejection_reason": "Five pieces declined after inspection",
    "evidence": {
      "safe_handling_confirmed": true,
      "unserved_confirmed": true,
      "storage_verified": true,
      "contamination_suspected": false,
      "storage_method": "HOT_HOLDING",
      "storage_temperature": 67,
      "uncontrolled_minutes": 0,
      "temperature_measured_at": "2026-11-28T19:20:00+05:30",
      "temperature_history_started_at": "2026-11-28T18:45:00+05:30",
      "temperature_history_min_c": 66,
      "temperature_history_max_c": 69,
      "temperature_history_reference": "BATCH-008-HANDOFF-LOG"
    }
  }],
  "notes": "Received and inspected"
}
```

The temperature values above are illustrative test data. Use the applicable approved food-specific policy for real food. Refresh a batch's existing `/waste-logs/{id}/safety-check` evidence before dispatch when necessary. A positive receipt requires both the original batch to remain within the live screening window and the inspected evidence to pass. Report failures that cannot meet current requirements. Image recognition and counting are never evidence for safety. There is no live GPS, route verification, automatic assignment, or automatic offer.

## Analytics and administration

| GET route | Response |
|---|---|
| /analytics/redistribution-summary | Offer, acceptance, completion, rejection, cancellation, expiry and failure counts, completion percentage, average recorded delivery minutes, NGOs served, and received quantities. |
| /analytics/redistribution-trends | `{"items":[{"date":"2026-11-28","quantities":[...]}],"is_simulated":false}`; `granularity=weekly` groups by Monday. |
| /analytics/donation-status-summary | `{"statuses":{"PENDING":0,"ACCEPTED":0,"COMPLETED":1,...},"expired_offers":0,"failed_donations":0,"is_simulated":false}`. |
| /analytics/ngo-impact | NGO rows with ID, name, successful receipt count and received quantities. |

All accept inclusive UTC `date_from` and `date_to`. Offer status aggregates filter by creation date. Quantities and delivery-duration metrics filter by completion date. A quantity row is `{"food_item_id":3,"food_name":"Chapati","serving_unit":"piece","received_quantity":20}`. Only positive quantities recorded on completed receipts are included. Completion percentages are based on offers and can include inspected zero-quantity completions. No people-fed, mass, emissions or monetary conversions are applied. Kitchen and NGO scope follow the authenticated profile. Admins can query platform-wide aggregates with `simulated=true` or `simulated=false` and inspect individual offers and delivery progress via `GET /donations`. Demo and real outcomes are kept separate.

## Run and test in Swagger

1. From `backend`, configure the existing database settings, then run `python -m alembic upgrade head`, `python -m alembic check`, and `python -m uvicorn app.main:app --reload`.
2. For a simulated run, use a dedicated local PostgreSQL database named `annachakra_demo*`. Point `DATABASE_URL` at it and set `APP_ENV=demo` and `SAFETY_POLICY_PATH=config/safety_policy.demo.json` for both the seeder and server. Apply the migrations, then run `python -m scripts.seed_redistribution_demo`. Enter a password of at least 12 characters when prompted. Rerunning the same date or `--batch-key` preserves that batch and users. Choose a new key for fresh fixtures. The seeder refuses other databases and never updates existing accounts.
3. Open `http://localhost:8000/docs`. Log in via `POST /api/v1/auth/login`, then paste the access token into **Authorize**. Seeded users are `redistribution-kitchen@example.com` and `redistribution-ngo@example.com`. Use separate browser sessions or switch tokens at each step.
4. As the NGO, list or create a requirement for today. For the demo Biryani, supply serving capacity and allow the catalogue category. As the kitchen, list available surplus, pass a waste ID to matching, and submit an offer for an eligible candidate.
5. Switch to the NGO and accept. As the kitchen, assign the seeded active driver, dispatch with current evidence, then mark delivered. As the NGO, confirm receipt with inspection and current evidence. For simulated receipts use the batch's posted preparation and simulated temperature history and record a test measurement at or after delivery.
6. View the donation, delivery, summary and trend endpoints. Try reducing capacity below an accepted reservation or accepting twice to see 409 responses.

The backend will refuse simulated policy use outside demo/test and will refuse real batches and organizations in demo mode. Production requires a separately approved, configured policy and valid evidence. There is no background cleanup queue or route/GPS integration.

Run regression tests from `backend` with `python -m pytest tests`. Set `FORECAST_TEST_POSTGRES=1` for opt-in PostgreSQL checks in isolated test schemas. Use a local development database with privileges to create these schemas.
