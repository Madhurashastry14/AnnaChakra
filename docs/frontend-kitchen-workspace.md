# AnnaChakra Kitchen Workspace

The kitchen workspace is a protected React/Vite frontend for `KITCHEN_STAFF` accounts. It uses the existing FastAPI backend as the source of truth for forecasts, meal records, scanner predictions, waste logs, safety screening, analytics and portion recommendations. It does not change backend, ML, database, migration or API contracts.

## Routes

| Route | Purpose |
|---|---|
| `/kitchen` | Entry point; redirects to the dashboard, or to setup when the account has no kitchen |
| `/kitchen/setup` | Create the kitchen profile with address, phone and map coordinates |
| `/kitchen/dashboard` | Overview of forecasts, meals, waste, insights and redistribution metrics |
| `/kitchen/menu-planner` | Smart menu recommendations and forecast handoff |
| `/kitchen/forecast` | Create a demand forecast and review quantities and ingredients |
| `/kitchen/forecasts` | Forecast history |
| `/kitchen/forecasts/:id` | Forecast detail |
| `/kitchen/meal-records` | Meal record history |
| `/kitchen/meal-records/new` | Record meal feedback, linked to a forecast or manual |
| `/kitchen/meal-records/:id` | Meal record detail and waste-log drafts |
| `/kitchen/scanner` | Upload a food image, review classification, correct food, recount and hand off to waste logging |
| `/kitchen/waste-logs` | Waste log history with filters and pagination |
| `/kitchen/waste-logs/new` | Log waste manually, from a scanner result, or from a meal-record draft |
| `/kitchen/waste-logs/:id` | Waste log detail and safety re-screening |
| `/kitchen/waste-logs/:id/edit` | Edit a waste log |
| `/kitchen/surplus` | Available, pending, expired and ineligible unserved batches |
| `/kitchen/matching` | Select eligible batches and review backend-ranked NGO matches |
| `/kitchen/analytics` | Waste intelligence, rates, trends and insights |
| `/kitchen/recommendations` | Portion recommendations |
| `/kitchen/donations` | Kitchen donation offers and status filters |
| `/kitchen/donations/new` | Confirm a donation offer for a selected NGO |
| `/kitchen/donations/:id` | Donation items, lifecycle timeline and permitted kitchen actions |
| `/kitchen/delivery` | Assignments, dispatch/delivery actions and delivery personnel management |
| `/kitchen/settings` | Kitchen profile and account settings |

Unknown `/kitchen/*` routes render an in-workspace not-found page.

## Key behaviour

- Authentication uses `sessionStorage.access_token`; there is no refresh-token flow. A `401` clears the session and returns the user to login.
- Kitchen staff login redirects to `/kitchen`. NGO and admin accounts keep the existing signed-in success screen.
- A missing kitchen (`404` from `/kitchens/me`) redirects to `/kitchen/setup` instead of showing an error.
- The workspace reuses the landing page’s cream and green identity and adds a scoped `src/styles/kitchen.css` design system.
- All operational values shown in the workspace come from API responses. No forecasts, analytics, safety results, donations, assignments or history are fabricated.
- Redistribution reads and actions use the existing `/api/v1` endpoints through the centralized authenticated API client. Offer creation rechecks current eligible batch availability; backend validation remains authoritative.
- The matching map shows backend-provided coordinates only. Distance and travel duration are estimates, not actual route or live GPS information.
- Redistribution quantities remain separate by catalogue unit. Dashboard impact metrics use completed receipt quantities and do not estimate people fed, food mass or carbon savings.

## Safety and measurement rules

- Food-safety status, safety notes, redistribution deadline and remaining loggable quantities are backend-authoritative. The UI displays them and never overrides them.
- Safety evidence fields are optional and tri-state. Unknown values remain unknown; the UI never fills temperatures, times or confirmations automatically.
- A scanner classification confidence is not a food-safety confidence. Scanner counts are experimental and require staff confirmation.
- `serving` and `piece` quantities are never combined in a total, chart or metric.
- `preference_share` from menu recommendations is an allocation share, not a probability.
- `food_acceptance_rate` is a consumed ÷ served proxy, not a direct preference measure.
- Plate waste that was not measured remains “not measured” rather than becoming zero.
- Legacy meal records without a recorded menu mode are kept separate from choice-based and fixed-meal records.
- Linked meal feedback must use the exact forecast dish set; the backend validates equality.

## API map

| Frontend service | Backend endpoints |
|---|---|
| `services/auth.js` | `POST /api/v1/auth/login`, `GET /api/v1/auth/me` |
| `services/kitchens.js` | `GET/POST/PATCH /api/v1/kitchens/me`, `POST /api/v1/kitchens` |
| `services/foodItems.js` | `GET /api/v1/food-items`, `POST /api/v1/food-items/{id}/ingredients/calculate` |
| `services/menu.js` | `POST /api/v1/menu/recommend` |
| `services/forecasts.js` | `POST/GET /api/v1/forecasts`, `GET /api/v1/forecasts/{id}` |
| `services/mealRecords.js` | `GET/POST /api/v1/meal-records`, `GET/PATCH /api/v1/meal-records/{id}`, `GET /api/v1/meal-records/{id}/waste-summary`, `GET /api/v1/meal-records/{id}/surplus-drafts` |
| `services/vision.js` | `POST /api/v1/vision/predict`, `POST /api/v1/vision/predictions/{id}/count`, `GET /api/v1/vision/images/{id}` |
| `services/wasteLogs.js` | `GET/POST /api/v1/waste-logs`, `GET/PATCH /api/v1/waste-logs/{id}`, `POST /api/v1/waste-logs/{id}/safety-check` |
| `services/analytics.js` | `GET /api/v1/analytics/waste-summary`, `food-acceptance`, `waste-trends`, `waste-insights`, `portion-recommendations` |
| `services/deliveryPersonnel.js` | `GET/POST /api/v1/delivery-personnel`, `GET/PATCH/DELETE /api/v1/delivery-personnel/{id}` |
| `services/redistribution.js` | `GET /api/v1/waste-logs/available-surplus`, `POST /api/v1/matches`, `/api/v1/donations` lifecycle routes, `GET /api/v1/deliveries`, `GET /api/v1/analytics/redistribution-summary` |

## Limitations

- The matching response includes suggested food allocations and compatibility reasons, but not the NGO requirement’s full accepted-category or dietary-preference fields. The kitchen UI can show foods allocated by the backend, not the complete requirement record.
- The backend exposes no actual-route verification or live GPS tracking. Delivery actions are status updates, not location tracking.
- The scanner may return `NOT_ATTEMPTED`, `UNSUPPORTED_FOOD`, `UNSUITABLE_IMAGE` or `DETECTION_FAILED`. The UI asks for manual quantity confirmation instead of inventing a count.
- Kitchen verification is read-only in the workspace. Only an administrator can change verification status.
- Analytics can be insufficient or unavailable until enough measured meal records exist. The UI shows that state rather than filling gaps.
- The Vite production bundle currently triggers a chunk-size warning because charts, maps and the full workspace are bundled together. This does not fail the build.

## Run locally

Backend (from the repository root, using the existing backend setup):

```bash
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend expects `VITE_API_URL=http://localhost:8000` in `frontend/.env`. The backend CORS configuration allows the Vite development origin `http://localhost:5173`.

Verification:

```bash
cd frontend
npm run lint
npm run build
```

## File map

- `src/auth/` — auth context and protected route.
- `src/services/` — typed-by-convention API wrappers.
- `src/utils/` — formatting, errors, ingredient consolidation, kitchen form helpers, image helpers and waste payload builders.
- `src/components/ui/` — shared buttons, cards, badges, forms, tables, charts, modals, safety panel and states.
- `src/components/kitchen/` — kitchen shell, navigation, location picker, food selectors, forecast result, safety fields and image uploader.
- `src/pages/kitchen/` — one page per route.
- `src/styles/kitchen.css` — scoped kitchen workspace design system, responsive rules and print styles.
