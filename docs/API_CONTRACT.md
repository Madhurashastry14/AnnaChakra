# AnnaChakra — API Contract v1

Status: proposed implementation contract. Examples are mock data, not live API results.
Base URL: `http://localhost:8000/api/v1`. Health: `GET /health` (outside prefix).

## Conventions

JSON except image upload (multipart/form-data). Integer IDs, ISO 8601 timestamps with timezone, dates YYYY-MM-DD. Auth: `Authorization: Bearer <access_token>`. Roles: `KITCHEN_STAFF`, `NGO_MANAGER`, `ADMIN`. All routes require authentication unless marked public. Kitchen/NGO ownership is derived from authenticated user, never trusted from request IDs. Admin accounts are seeded, not publicly registered. List responses use `{ "items": [], "total": 0 }` with `limit` (default 20, max 100) and `offset` (default 0). Detail/create responses return the object directly. Errors use FastAPI `{"detail":"message"}`; validation errors use FastAPI's detail array. HTTP 200 read/update/action, 201 create, 400 invalid business input, 401 unauthenticated, 403 forbidden, 404 missing, 409 conflict, 422 validation, 503 unavailable. No trailing slashes.

## 1. Authentication (both frontend developers)

| Method | Path | Access | Body |
|---|---|---|---|
| POST | /auth/register | Public | name, email, password, role (kitchen or NGO only) |
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

## 4. Demand forecasting (kitchen UI)

`POST /forecasts` — Kitchen, 201. Request:
```json
{"meal_date":"2026-11-27","meal_type":"LUNCH","expected_people":200,"food_item_ids":[1,2]}
```
Response:
```json
{"id":1,"meal_date":"2026-11-27","meal_type":"LUNCH","expected_people":200,"model_version":null,"items":[{"food_item_id":1,"name":"Rice","serving_unit":"serving","predicted_servings":190.2,"recommended_servings":191,"prediction_method":"BASELINE","ingredients":[{"name":"Raw rice","quantity":14.325,"unit":"kg"}]}],"created_at":"2026-11-27T06:00:00Z"}
```
Example shows one item for brevity; actual response includes every requested dish. Methods BASELINE, LOCAL_HISTORY, ML. model_version nullable when no trained model used. Each item also includes expected_people, historical_observation_count, model_version, and warnings. Recommendations round up and ingredients derive from recommended servings. Cold start uses catalogue defaults; local history adjusts demand; ML only used when suitable training data/model available. Meal types BREAKFAST, LUNCH, DINNER. Positive attendance, unique nonempty menu.

`GET /forecasts` — Kitchen list, optional meal_date. `GET /forecasts/{id}` — Kitchen detail. Both return forecast objects above.

## 5. Meal records (kitchen UI)

`POST /meal-records` — Kitchen, 201. Request:
```json
{"forecast_id":1,"meal_date":"2026-11-27","meal_type":"LUNCH","actual_people":185,"items":[{"food_item_id":1,"prepared_servings":200,"leftover_servings":25,"plate_waste_servings":5,"shortage_occurred":false}]}
```
Response: request fields plus `id`, `created_at`, and each item's `id`, `served_servings` (175), `consumed_servings` (170). `forecast_id` and `plate_waste_servings` nullable; consumed is null if plate waste unknown. Leftover means unserved surplus only. Nonnegative quantities; leftover <= prepared; plate waste <= served. Actual attendance may be zero; exclude zero-attendance and shortage records from naive per-person demand training. Demand target is served quantity, not consumed quantity. One record per linked forecast; dish IDs unique. Linked forecast must belong to kitchen and match date/type/menu. Records without a forecast are allowed. Meal dates must be today or earlier. Piece-based quantities must be whole numbers.

`GET /meal-records` — Kitchen list; `GET /meal-records/{id}` — detail; `PATCH /meal-records/{id}` — same editable fields, disallow changes conflicting with linked waste/donation records. Store records for future retraining; saving a record does not automatically retrain a model.

## 6. Computer vision and waste logging (kitchen UI)

`POST /vision/analyze` — Kitchen, multipart field `image` (JPEG/PNG, max 5 MB). Response:
```json
{"image_id":"opaque-upload-id","predicted_food":"chapati","food_item_id":3,"confidence_score":0.87,"estimated_servings":null,"quantity_method":"UNAVAILABLE","requires_confirmation":true}
```
`food_item_id`, prediction and confidence may be null if unavailable. Confidence is 0–1, not safety probability. Quantity method UNAVAILABLE or EXPERIMENTAL. Absolute quantity cannot be reliably inferred from ordinary photos; staff confirm quantity. If model unavailable, accept valid upload and return null predictions. Upload IDs scoped to owner; no arbitrary file paths. No safety inference from images.

`POST /waste-logs` — Kitchen, 201. Request:
```json
{"image_id":"opaque-upload-id","meal_record_item_id":1,"food_item_id":3,"confirmed_servings":25,"waste_type":"UNSERVED_SURPLUS","prepared_at":"2026-11-27T05:00:00Z","storage_temperature":null}
```
`image_id` and meal_record_item_id nullable (manual fallback). Types UNSERVED_SURPLUS, PLATE_WASTE, SPOILED_FOOD. Positive confirmed quantity. Linked item must match kitchen and food; cumulative logged unserved quantity cannot exceed recorded surplus. Response includes request fields, id, image_url (nullable, authorized access), predicted_food, confidence_score, estimated_servings, safety_status (PENDING), safety_notes, available_servings, created_at. `GET /waste-logs` list; `GET /waste-logs/{id}` detail.

`POST /waste-logs/{id}/safety-check` — Kitchen. Request:
```json
{"unserved_confirmed":true,"handling_verified":true,"storage_verified":true,"contamination_suspected":false,"storage_temperature":null,"safe_until":"2026-11-27T08:00:00Z","notes":"Staff verification"}
```
Response: `{"waste_log_id":1,"safety_status":"PENDING","safe_until":null,"reasons":["Storage evidence incomplete"]}` (illustrative). Status PENDING, ELIGIBLE, INELIGIBLE. Only unserved surplus with documented handling, applicable time/temperature evidence and a valid safe deadline can qualify under configured food-specific safety policy. Missing evidence fails closed; no universal safe temperature/time assumed. Staff attestations are not a guarantee of safety. Recheck deadline at matching, acceptance and dispatch. Persist check evidence; no real food distribution based solely on prototype.

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
