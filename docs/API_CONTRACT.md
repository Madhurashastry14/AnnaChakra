# AnnaChakra — API Contract v1

Status: proposed implementation contract. Examples are mock data, not live API results.
Base URL: `http://localhost:8000/api/v1`. Health: `GET /health` (outside prefix).

## Conventions

JSON except image upload (multipart/form-data). Integer IDs, ISO 8601 timestamps with timezone, dates YYYY-MM-DD. Auth: `Authorization: Bearer <access_token>`. Roles: `KITCHEN_STAFF`, `NGO_MANAGER`, `ADMIN`. All routes require authentication unless marked public. Kitchen/NGO ownership is derived from authenticated user, never trusted from request IDs. Admin accounts are seeded, not publicly registered. List responses use `{ "items": [], "total": 0 }` with `limit` (default 20, max 100) and `offset` (default 0). Detail/create responses return the object directly. Errors use FastAPI `{"detail":"message"}`; validation errors use FastAPI's detail array. HTTP 200 read/update/action, 201 create, 400 invalid business input, 401 unauthenticated, 403 forbidden, 404 missing, 409 conflict, 422 validation, 503 unavailable. No trailing slashes.

## 1. Authentication (both frontend developers)

| Method | Path | Access | Body |
|---|---|---|---|
| POST | /auth/register | Public | name, email, password, role (`KITCHEN_STAFF` or `NGO_MANAGER`; `ADMIN` is rejected) |
| POST | /auth/login | Public | email, password |
| GET | /auth/me | All | — |

Register returns 201 user object; login returns:
```json
{"access_token":"mock-token","token_type":"bearer","user":{"id":1,"name":"Demo Staff","email":"staff@example.com","role":"KITCHEN_STAFF","organization_id":1}}
```
`GET /auth/me` returns the user object. organization_id is null until organization registration. Logout is client-side token removal for MVP; no refresh or revocation endpoint. Password never returned.

## 2. Organizations

| Method | Path | Access | Body |
|---|---|---|---|
| POST | /kitchens | Kitchen | name, address, latitude, longitude, phone |
| GET | /kitchens/me | Kitchen | — |
| PATCH | /kitchens/me | Kitchen | editable organization fields |
| POST | /ngos | NGO | name, address, latitude, longitude, phone |
| GET | /ngos/me | NGO | — |
| PATCH | /ngos/me | NGO | editable organization fields |

Organization response:
```json
{"id":1,"name":"Demo Kitchen","address":"Demo address","latitude":12.91,"longitude":74.85,"phone":"0000000000","verification_status":"PENDING"}
```
One organization per manager for MVP. Status PENDING, VERIFIED, REJECTED; only admin changes verification. Verified organizations only may offer or receive donations. Other kitchen operations allowed before verification. Coordinates must be valid; mock coordinates are illustrative.

## 3. Food catalogue (kitchen UI)

`GET /food-items` — authenticated, optional `search` query. List item:
```json
{"id":1,"name":"Rice","category":"MAIN","serving_unit":"serving","is_vegetarian":true,"default_servings_per_person":1,"ingredients_per_serving":[{"name":"Raw rice","quantity":75,"unit":"g"}]}
```
Catalogue seeded by backend. `serving_unit` is `serving` or `piece`. Recipe quantities are illustrative defaults, not universal standards. Unknown recipes return an empty ingredients array. Day of week derived from date.

Catalogue responses and admin create/update requests support nullable `food_role` (`MAIN_DISH`, `ACCOMPANIMENT`, `SIDE_DISH`, `DESSERT`, `BEVERAGE`), `uptake_rate` from 0 to 1 (default 0.75), positive `preference_weight` (default 1), and `compatible_main_food_item_ids` (default empty). Only accompaniments can reference compatible main dishes. The referenced IDs must be unique and already configured as main dishes.

## 4. Demand forecasting (kitchen UI)

`POST /forecasts` — Kitchen, 201. Request:
```json
{"meal_date":"2026-11-27","meal_type":"LUNCH","expected_people":200,"food_item_ids":[1,2],"menu_mode":"CHOICE_BASED"}
```
Response:
```json
{"id":1,"meal_date":"2026-11-27","meal_type":"LUNCH","expected_people":200,"menu_mode":"CHOICE_BASED","model_version":null,"items":[{"food_item_id":1,"name":"Rice","serving_unit":"serving","expected_people":200,"predicted_servings":100,"recommended_servings":100,"prediction_method":"BASELINE","historical_observation_count":0,"model_version":null,"ingredients":[{"name":"Raw rice","quantity":7.5,"unit":"kg"}],"warnings":["No eligible prior meal records for this dish and menu context."],"food_role":"MAIN_DISH","estimated_diners":100,"preference_share":0.5,"compatible_main_food_item_ids":[],"allocation_method":"CATALOGUE_PRIOR"}],"created_at":"2026-11-27T06:00:00Z"}
```
Example shows one item for brevity; actual response includes every requested dish. Methods BASELINE, LOCAL_HISTORY, ML. model_version nullable when no trained model used. Each item also includes expected_people, historical_observation_count, model_version, and warnings. Recommendations round up and ingredients derive from recommended servings. Cold start uses catalogue defaults; local history adjusts demand; ML only used when suitable training data/model available. Meal types BREAKFAST, LUNCH, DINNER. Positive attendance, unique nonempty menu.

`menu_mode` is optional on create and defaults to `CHOICE_BASED`. The choice mains' integer allocated diners sum to expected attendance. `FIXED_MEAL` allocates expected attendance to each main. For an accompaniment or other non-main dish, `estimated_diners` is the estimated number of recipients and may be fractional. `preference_share` is a 0–1 value before diner rounding for choice mains and null otherwise. `compatible_main_food_item_ids` lists the configured associations. `allocation_method` describes how the estimate was produced. Historical forecasts retain their saved quantities and return null for menu fields that were unavailable when saved.

`GET /forecasts` — Kitchen list, optional meal_date. `GET /forecasts/{id}` — Kitchen detail. Both return forecast objects above.

## 5. Meal records (kitchen UI)

`POST /meal-records` — Kitchen, 201. Request:
```json
{"forecast_id":1,"meal_date":"2026-11-27","meal_type":"LUNCH","actual_people":185,"items":[{"food_item_id":1,"prepared_servings":200,"leftover_servings":25,"plate_waste_servings":5,"shortage_occurred":false}]}
```
Response: request fields plus `id`, `created_at`, and each item's `id`, `served_servings` (175), `consumed_servings` (170). `forecast_id` and `plate_waste_servings` nullable; consumed is null if plate waste unknown. Leftover means unserved surplus only. Nonnegative quantities; leftover <= prepared; plate waste <= served. Actual attendance may be zero; exclude zero-attendance and shortage records from naive per-person demand training. Demand target is served quantity, not consumed quantity. One record per linked forecast; dish IDs unique. Linked forecast must belong to kitchen and match date/type/menu. Linked feedback inherits the forecast's mode, and a conflicting explicit mode returns 422. Manual feedback can set optional `menu_mode` to `CHOICE_BASED` or `FIXED_MEAL`. Missing mode is returned as null and cannot inform competing choice shares. Meal dates must be today or earlier. Piece-based quantities must be whole numbers.

`GET /meal-records` — Kitchen list; `GET /meal-records/{id}` — detail; `PATCH /meal-records/{id}` — same editable fields, disallow changes conflicting with linked waste/donation records. Store records for future retraining; saving a record does not automatically retrain a model.

## 6. Computer vision and waste logging (kitchen UI)

`POST /vision/predict` — Kitchen staff bearer token and associated kitchen. Send `multipart/form-data` field `image` with a JPEG, PNG, or WebP (5 MiB by default). `POST /vision/analyze` is an alias. Response example with no recognition available:
```json
{"prediction_id":"aabbccddeeff00112233445566778899","image_id":"aabbccddeeff00112233445566778899","predicted_food":null,"food_item_id":null,"confidence":null,"confidence_score":null,"model_version":null,"serving_unit":null,"top_predictions":[],"estimated_servings":null,"quantity_method":"UNAVAILABLE","requires_confirmation":true,"requires_food_confirmation":true,"requires_quantity_confirmation":true,"warnings":["Food recognition unavailable. Select the food manually."]}
```
Each `top_predictions` entry has `label`, `food`, `food_item_id`, `confidence`, and `serving_unit`. A catalogue match may be null. Confidence ranges from 0 to 1 and describes classification only. Keep food editable even at high confidence and require a separately entered quantity. Show suggestions or a searchable manual selector after upload completion. `GET /vision/images/{prediction_id}` returns bytes to the owning kitchen with bearer authentication. Fetch the image as an authenticated blob. There is no public static URL.

Vision errors include 401 (authentication), 403 (role), 404 (missing kitchen or inaccessible image), 413 (byte or decoded dimension limit), 415 (unsupported extension/content or corrupt image), 422 (missing multipart field), and 500 (storage or database failure).

`POST /waste-logs` — Kitchen, 201. Request:
```json
{"prediction_id":"aabbccddeeff00112233445566778899","meal_record_item_id":1,"food_item_id":3,"confirmed_servings":25,"waste_type":"UNSERVED_SURPLUS","prepared_at":"2026-11-27T05:00:00Z","storage_temperature":null,"safe_handling_confirmed":false}
```
The optional `prediction_id` also accepts the legacy request key `image_id`. Omit both for manual logs. `meal_record_item_id`, `prepared_at`, `storage_temperature` in Celsius, and `notes` are optional. Supply a time zone with timestamps. Types are `UNSERVED_SURPLUS`, `PLATE_WASTE`, and `SPOILED_FOOD`. Quantities are positive and finite with whole pieces. Linked food must match the meal's dish. Linked unserved and spoiled waste share the unserved balance. Plate waste uses its own recorded balance when known.

Responses include the request values plus `id`, `created_at`, `food_name`, `serving_unit`, `image_id`, `image_url`, server-owned `predicted_food`, `confidence_score`, `model_version`, `estimated_servings`, `safety_status`, `safety_notes` (list), `screened_at`, `safe_until`, `safety_policy_version`, and `available_servings`. Use `GET /waste-logs/{id}` for detail and `PATCH /waste-logs/{id}` for partial staff edits. `GET /waste-logs` returns a list sorted newest first and accepts `limit` (1–100, default 20), `offset`, `waste_type`, `safety_status`, `food_item_id`, `created_from`, and `created_to`.

Waste errors include 400 (invalid date range), 401 (authentication), 403 (role), 404 (missing or inaccessible reference), 409 (quantity accounting or donation conflict), 422 (validation), and 500 (transaction failure).

`POST /waste-logs/{id}/safety-check` — Kitchen. Request:
```json
{"unserved_confirmed":true,"handling_verified":true,"storage_verified":true,"contamination_suspected":false,"storage_temperature":null,"storage_method":"HOT_HOLDING","notes":"Staff verification"}
```
The JSON body is a partial evidence update. Send an empty object to recheck stored evidence. The optional evidence fields also work on waste create and patch. In addition to the example, fields include `prepared_at`, `temperature_measured_at`, `temperature_history_started_at`, `temperature_history_min_c`, `temperature_history_max_c`, `temperature_history_reference`, `uncontrolled_minutes`, and `discard_at` (a shorter staff-provided deadline). `safe_until` is accepted as a legacy input alias for `discard_at` and cannot extend eligibility. `handling_verified` is a safety-check input alias for `safe_handling_confirmed`. Storage methods are `HOT_HOLDING`, `REFRIGERATED`, `FROZEN`, `AMBIENT`, and `UNKNOWN`.

The check returns `waste_log_id`, `safety_status`, `safe_until`, `reasons`, `screened_at`, and `safety_policy_version`. Show `PENDING` as needing evidence or review, `INELIGIBLE` as unavailable, and `ELIGIBLE` as having passed the configured checks. Clients cannot write status or prediction metadata. Only eligible, unexpired records have positive availability. See the [operator guide](VISION_WASTE.md).

## 7. NGO requirements (NGO UI)

| Method | Path | Access |
|---|---|---|
| POST | /ngo-requirements | NGO |
| GET | /ngo-requirements | NGO (own) |
| PATCH | /ngo-requirements/{id} | NGO (own) |

Create request:
```json
{"people_to_feed":100,"capacity_servings":300,"accepts_vegetarian":true,"accepts_non_vegetarian":false,"required_date":"2026-11-27","available_until":"2026-11-27T08:00:00Z"}
```
Response includes request fields plus id, ngo_id, remaining_capacity (initially capacity_servings), is_active, created_at. PATCH accepts editable requirements and is_active; cannot directly edit remaining_capacity or reduce capacity below reserved quantities. People to feed and total dish servings are different units; pieces are not automatically complete meals. Capacity uses catalogue-defined serving equivalents where known; otherwise matching requires manual confirmation, not automatic conversion.

## 8. NGO matching (kitchen UI)

`POST /matches` — Kitchen, read-only computation. Request:
```json
{"items":[{"waste_log_id":1,"offered_servings":25}]}
```
Response:
```json
{"items":[{"ngo_id":2,"requirement_id":1,"ngo_name":"Demo NGO","latitude":12.92,"longitude":74.86,"distance_km":1.6,"people_to_feed":100,"remaining_capacity":300,"match_score":82,"reasons":["Accepts offered food","Within delivery range"]}],"total":1}
```
Distance is straight-line Haversine, not road distance or ETA. Hard filters: verified organizations, eligible unexpired surplus, positive available quantity, active compatible requirement, dietary acceptance, capacity and delivery feasibility. Rank by distance, need and capacity using documented rule-based score (0–100); not ML. If no match return empty list. Scores are illustrative. No reservation until donation creation.

## 9. Donations (kitchen and NGO UI)

`POST /donations` — Kitchen, 201. Request:
```json
{"requirement_id":1,"items":[{"waste_log_id":1,"offered_servings":25}]}
```
Response:
```json
{"id":1,"kitchen_id":1,"kitchen_name":"Demo Kitchen","ngo_id":2,"ngo_name":"Demo NGO","requirement_id":1,"status":"PENDING","items":[{"id":1,"waste_log_id":1,"food_item_id":3,"food_name":"Chapati","serving_unit":"piece","offered_servings":25,"received_servings":null}],"delivery":null,"created_at":"2026-11-27T06:00:00Z","completed_at":null}
```
`GET /donations` — Kitchen/NGO own list, optional status filter; Admin all. `GET /donations/{id}` — same ownership rules.

| Method | Path | Role | Body / action |
|---|---|---|---|
| POST | /donations/{id}/accept | NGO | empty; PENDING → ACCEPTED |
| POST | /donations/{id}/reject | NGO | reason; PENDING → REJECTED |
| POST | /donations/{id}/cancel | Kitchen | reason; PENDING/ACCEPTED/ASSIGNED → CANCELLED |
| POST | /donations/{id}/assign | Kitchen | delivery_person_id; ACCEPTED → ASSIGNED |
| POST | /donations/{id}/dispatch | Kitchen | empty; ASSIGNED → IN_TRANSIT |
| POST | /donations/{id}/delivered | Kitchen | empty; IN_TRANSIT → DELIVERED |
| POST | /donations/{id}/confirm | NGO | items: [{donation_item_id, received_servings}]; DELIVERED → COMPLETED |

All actions return updated donation object. Validate transitions server-side, otherwise 409. Reserve surplus and NGO capacity atomically at creation; release on rejection/cancellation; expire stale pending offers before new allocations. Never double-allocate food. Received quantities nonnegative and <= offered, confirm every item. Completed donation consumes actual received capacity; release unused capacity, but do not automatically re-offer undelivered food without safety review. Recheck safety and availability before acceptance/dispatch. In-transit safety incident handling requires manual intervention; no automated claim of safe delivery.

## 10. Delivery personnel (kitchen UI)

`POST /delivery-personnel` — Kitchen, 201; body name, phone. `GET /delivery-personnel` — Kitchen own list. `PATCH /delivery-personnel/{id}` — Kitchen own; name, phone, is_active. Response: `{"id":1,"name":"Demo Driver","phone":"0000000000","is_active":true}`.
Delivery object embedded in donation after assignment: `{"id":1,"delivery_person_id":1,"delivery_person_name":"Demo Driver","status":"ASSIGNED","dispatched_at":null,"delivered_at":null}`. Delivery status follows donation actions. No driver login or live GPS for MVP.

## 11. Admin and analytics

| Method | Path | Access |
|---|---|---|
| GET | /admin/kitchens | Admin |
| GET | /admin/ngos | Admin |
| PATCH | /admin/kitchens/{id}/verification | Admin |
| PATCH | /admin/ngos/{id}/verification | Admin |
| GET | /analytics/summary | All (role scoped) |
| GET | /analytics/trends | All (role scoped) |

Verification body `{"verification_status":"VERIFIED"}`; return organization. Analytics accept optional `date_from`, `date_to` inclusive. Summary example:
```json
{"completed_donations":3,"pending_donations":2,"quantities":[{"unit":"serving","prepared":500,"unserved_surplus":70,"redistributed":50},{"unit":"piece","prepared":200,"unserved_surplus":30,"redistributed":25}],"estimated_complete_meals":null}
```
Trends response `{"items":[{"date":"2026-11-27","unit":"serving","prepared":500,"unserved_surplus":70,"redistributed":50}]}`. NGO scope shows received quantities only; unavailable fields null. Admin aggregate, kitchen own data. Redistributed uses completed actual received amounts only. Do not sum pieces and servings or claim meals, kg, CO2 or savings without defensible conversion/baseline.

## 12. Model management (P1)

`GET /admin/model-versions` — Admin list. Item: `{"id":1,"model_name":"demand","version":"v1","training_records":100,"evaluation_metrics":{"mae":8.2},"trained_at":"2026-11-27T06:00:00Z","is_active":false}`. Example metrics are mock. Retraining initially via offline script using completed records; evaluate against baseline and promote only after validation. No retraining HTTP endpoint required for MVP.

## Frontend coordination

Kitchen developer: kitchen registration, catalogue, forecasts, meal records, waste/vision/safety, matching, donations, delivery. NGO/admin developer: auth, common layout, NGO registration/requirements, donation acceptance/confirmation, admin verification, analytics. Both use shared Axios client, token handling, status constants and reusable components. Use mock objects above until endpoints are available. Do not expose admin registration. Handle loading, empty, validation, 401/403/409 and unavailable model states. Coordinate changes to shared App/router/layout files. Contract changes must be communicated before merging.

## Waste intelligence and smart menu planning

All endpoints below use the `/api/v1` prefix and the kitchen staff bearer token. They operate on the associated kitchen. Existing forecast and waste endpoints retain their prior request fields.

### Image counting

`POST /vision/predict` still accepts multipart field `image`. An example response showing an estimate:

```json
{"prediction_id":"aabbccddeeff00112233445566778899","image_id":"aabbccddeeff00112233445566778899","predicted_food":"Chapati","food_item_id":12,"confidence":0.94,"confidence_score":0.94,"serving_unit":"piece","model_version":"example","top_predictions":[{"label":"chapati","food":"Chapati","food_item_id":12,"confidence":0.94,"serving_unit":"piece"}],"estimated_servings":1,"quantity_method":"EXPERIMENTAL","count_food_item_id":12,"counting_method":"OPENCV_CONTOUR","counting_status":"ESTIMATED","boxes":[[0.25,0.2,0.35,0.4]],"counting_warnings":["Experimental estimate of visible pieces only. Confirm the quantity."],"requires_confirmation":true,"requires_food_confirmation":true,"requires_quantity_confirmation":true,"warnings":["Experimental estimate of visible pieces only. Confirm the quantity."]}
```

`POST /vision/predictions/{prediction_id}/count` accepts JSON `{"food_item_id":12}` to count for a staff-selected food without changing the original classification. Success returns the estimate, method, status, normalized `boxes` as `[x,y,width,height]`, `count_food_item_id`, `counting_warnings`, and `requires_quantity_confirmation`. Count statuses are `ESTIMATED`, `UNSUPPORTED_FOOD`, `UNSUITABLE_IMAGE`, `DETECTION_FAILED`, and `NOT_ATTEMPTED`. A non-estimated response has null quantity. The operation returns 404 for inaccessible references and 415 for unreadable saved images. Invalidate the suggestion if staff selects a different food. Confirm food and quantity before posting a waste log. Duplicate upload references or exact decoded images already used for that kitchen can return 409 on waste creation.

### Meal waste accounting

`GET /meal-records/{record_id}/waste-summary` returns `meal_record_id`, `meal_date`, and `items`. For example:

```json
{"meal_record_id":10,"meal_date":"2026-11-26","items":[{"meal_record_item_id":31,"food_item_id":12,"food_item_name":"Chapati","serving_unit":"piece","prepared_servings":24,"served_servings":16,"recorded_unserved":8,"recorded_plate_waste":null,"logged_unserved":2,"logged_spoiled":0,"logged_plate_waste":0,"remaining_unserved":6,"remaining_plate_waste":null,"waste_log_ids":[19],"recorded_preparation_times":[],"logging_drafts":[{"meal_record_item_id":31,"food_item_id":12,"confirmed_servings":6,"waste_type":"UNSERVED_SURPLUS"}]}]}
```

`GET /meal-records/{record_id}/surplus-drafts` returns the same meal header and `drafts`. Each draft has the meal and food IDs, food name and unit, recorded and remaining unserved quantities, a `required_safety_information` array, warnings, `requires_quantity_confirmation`, and a nested `draft` object for `POST /waste-logs`. For example, its nested request can be `{"meal_record_item_id":31,"food_item_id":12,"confirmed_servings":6,"waste_type":"UNSERVED_SURPLUS","prepared_at":null}`. Both read endpoints return 404 for another kitchen's meal. Saving a draft never bypasses the existing safety screen or updates meal feedback.

### Kitchen analytics

`GET /analytics/waste-summary` and `GET /analytics/food-acceptance` return arrays of quantity-weighted metrics. `GET /analytics/waste-trends` adds a `date` field to each daily row. Shared optional filters are `start_date`, `end_date`, `meal_type`, `food_item_id`, and `menu_mode`. Example row:

```json
{"food_item_id":12,"food_item_name":"Chapati","serving_unit":"piece","meal_type":"LUNCH","menu_mode":"CHOICE_BASED","records_analyzed":1,"measured_plate_waste_records":1,"shortage_eligible_records":1,"shortage_records":0,"total_prepared":24,"total_served":16,"total_unserved":8,"total_plate_waste":2,"total_consumed":14,"measured_prepared":24,"measured_served":16,"overproduction_rate":33.3333,"plate_waste_rate":12.5,"food_acceptance_rate":87.5,"consumption_efficiency":58.3333,"plate_waste_measurement_coverage":100,"shortage_frequency":0}
```

`GET /analytics/waste-insights` returns `{"insights":[...]}` with food and meal context, insight type, severity, sample size, observed rate, threshold, title, description, recommendation, evidence quality and supporting metrics. `GET /analytics/portion-recommendations` returns `{"forecast_id":null,"recommendations":[...]}`. Each row has food, serving unit, catalogue default, metrics, uncensored served-per-attendee statistics, portion and preparation actions, sample size and warnings. Optional `forecast_id` restricts evidence to comparable prior menus and includes the forecast preparation quantity and expected attendance. Unknown quantities and zero-denominator rates are null. Show measurement coverage alongside the plate and consumption metrics.

### Menu proposal

`POST /menu/recommend` request:

```json
{"meal_date":"2026-11-28","meal_type":"LUNCH","expected_people":200,"menu_mode":"CHOICE_BASED","vegetarian_only":true,"max_main_dishes":1,"max_accompaniments":1,"max_dishes":2,"required_food_item_ids":[7],"excluded_food_item_ids":[]}
```

Example response:

```json
{"meal_date":"2026-11-28","meal_type":"LUNCH","expected_people":200,"menu_mode":"CHOICE_BASED","recommendation_method":"CATALOGUE_BASED","recommended_food_item_ids":[7,15],"recommended_items":[{"food_item_id":7,"food_item_name":"Steamed Rice","food_role":"MAIN_DISH","serving_unit":"serving","recommendation_score":55,"recommendation_method":"CATALOGUE_BASED","data_availability":"NO_HISTORY","records_analyzed":0,"waste_metrics":null,"reasons":["Catalogue preference weight and meal-type compatibility guide this suggestion."]},{"food_item_id":15,"food_item_name":"Sambar","food_role":"ACCOMPANIMENT","serving_unit":"serving","recommendation_score":55,"recommendation_method":"CATALOGUE_BASED","data_availability":"NO_HISTORY","records_analyzed":0,"waste_metrics":null,"reasons":["Catalogue preference weight and meal-type compatibility guide this suggestion."]}],"warnings":["Comparable kitchen history is limited. Review the proposed menu before forecasting."],"forecast_request":{"meal_date":"2026-11-28","meal_type":"LUNCH","expected_people":200,"menu_mode":"CHOICE_BASED","food_item_ids":[7,15]}}
```

IDs and quantities above are illustrative. Missing required or excluded catalogue IDs return 404. Conflicting constraints or no valid complete meal return 422. Catalogue admin requests can set `supported_meal_types` to a unique list of `BREAKFAST`, `LUNCH`, and `DINNER`. Keep the proposal editable and submit the reviewed `forecast_request` to `POST /forecasts` only after staff confirms the final menu. [Operator and workflow guide](WASTE_INTELLIGENCE.md).
