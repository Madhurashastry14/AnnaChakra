# Kitchen Staff Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete, responsive AnnaChakra kitchen-staff frontend against the existing FastAPI backend, without changing backend, ML, database, or unrelated pages.

**Architecture:** Add an authentication context and axios interceptors to the existing Vite/React app, then mount a protected `/kitchen/*` workspace behind a shared dashboard layout. Domain API modules wrap the verified endpoints; reusable UI primitives and page-specific components keep pages modular. All metrics, predictions, safety results, and records come from live API responses.

**Tech Stack:** React 19, Vite 8, React Router 7, Axios, Tailwind (existing), custom CSS design system, Lucide React, Recharts, Leaflet/React Leaflet.

**Spec:** User brief in the session (sections 1–24). Verified backend contract summarized in the session discovery record.

## Global Constraints

- Frontend only. Never edit `backend/`, `ml/`, migrations, datasets, models, or API contracts.
- Never fabricate forecasts, analytics, safety results, donations, deliveries, or history.
- Never combine `serving` and `piece` quantities in a single total or chart.
- `preference_share` is an allocation share, never a probability.
- Classification confidence is not food-safety confidence.
- Safety status and remaining loggable quantities are backend-authoritative.
- Tokens stay in `sessionStorage`; never log them. No refresh flow exists.
- No commits pushed; atomic local commits only; no AI attribution.
- Preserve landing, login, and registration design; preserve NGO/admin behaviour.

## Routes

| Route | Access | Purpose |
|---|---|---|
| `/kitchen` | Auth + KITCHEN_STAFF | Gate: redirect to setup (404) or dashboard |
| `/kitchen/setup` | Auth + KITCHEN_STAFF | Create kitchen |
| `/kitchen/dashboard` | Auth + kitchen | Overview |
| `/kitchen/menu-planner` | Auth + kitchen | Menu recommendations |
| `/kitchen/forecast` | Auth + kitchen | Create forecast + results |
| `/kitchen/forecasts` | Auth + kitchen | Forecast history |
| `/kitchen/forecasts/:id` | Auth + kitchen | Forecast detail |
| `/kitchen/meal-records` | Auth + kitchen | Meal record list |
| `/kitchen/meal-records/new` | Auth + kitchen | Record feedback |
| `/kitchen/meal-records/:id` | Auth + kitchen | Meal record detail |
| `/kitchen/scanner` | Auth + kitchen | Vision prediction |
| `/kitchen/waste-logs` | Auth + kitchen | Waste log list |
| `/kitchen/waste-logs/new` | Auth + kitchen | Log waste |
| `/kitchen/waste-logs/:id` | Auth + kitchen | Waste log detail |
| `/kitchen/waste-logs/:id/edit` | Auth + kitchen | Update waste log |
| `/kitchen/analytics` | Auth + kitchen | Waste intelligence |
| `/kitchen/recommendations` | Auth + kitchen | Portion recommendations |
| `/kitchen/delivery` | Auth + kitchen | Delivery personnel + unavailable assignments |
| `/kitchen/donations` | Auth + kitchen | Honest unavailable state |
| `/kitchen/settings` | Auth + kitchen | Kitchen profile |

## File Structure

```
src/
  main.jsx                        (wrap AuthProvider)
  App.jsx                         (add kitchen routes; preserve landing)
  auth/AuthContext.jsx
  auth/ProtectedRoute.jsx
  services/api.js                 (interceptors)
  services/auth.js
  services/kitchens.js
  services/foodItems.js
  services/forecasts.js
  services/menu.js
  services/mealRecords.js
  services/vision.js
  services/wasteLogs.js
  services/analytics.js
  services/deliveryPersonnel.js
  utils/format.js
  utils/errors.js
  utils/ingredients.js
  components/ui/...               (Button, Card, Badge, Field, etc.)
  components/kitchen/...          (Sidebar, Header, layout, selectors, tables)
  components/feedback/...         (Toast provider)
  pages/kitchen/...               (one file per route)
  styles/kitchen.css
```

## Phase 1 — Foundation

- [ ] Update `services/api.js` with token request interceptor and 401 event.
- [ ] Create `AuthContext` (bootstraps `/auth/me`, login, logout, 401 handling).
- [ ] Create `ProtectedRoute` + `RequireRole`.
- [ ] Create `KitchenLayout`, `Sidebar`, `Header`, `KitchenGate`.
- [ ] Add routes in `App.jsx`; keep landing/auth untouched except login redirect for kitchen staff.
- [ ] Update `AuthPage` to use auth context and redirect KITCHEN_STAFF to `/kitchen`.
- [ ] Create `kitchen.css` tokens, layout, typography, form, table, responsive styles.
- [ ] Verify `npm run lint` and `npm run build`.

## Phase 2 — Onboarding + Settings

- [ ] `KitchenSetupPage`: form (name, address, phone, lat, lon), Leaflet click map, geolocation, manual coords, POST `/kitchens`, verification explanation.
- [ ] `KitchenSettingsPage`: GET/PATCH `/kitchens/me`, read-only verification, account card, logout.
- [ ] Handle 409 already registered and 404 missing kitchen.

## Phase 3 — Menu + Forecast

- [ ] `MenuPlannerPage`: full recommendation form, catalogue selectors, choice/fixed explanations, results grouped by role, score/method/data availability/reasons/waste metrics/warnings, editable selection, handoff via `sessionStorage` + router state.
- [ ] `ForecastPage`: form prefilled from menu planner, grouped searchable catalogue, POST `/forecasts`, result cards with method labels, allocation share, ingredients, consolidated ingredients (dimension-safe conversion), print view.
- [ ] `ForecastHistoryPage`: GET `/forecasts`, client filters/search/pagination, detail link.
- [ ] `ForecastDetailPage`: reuse result component, ingredient requirements, record-feedback link.

## Phase 4 — Meal Records

- [ ] `MealRecordsPage`: list, search, filters, pagination, detail link.
- [ ] `MealRecordFormPage`: linked-forecast or manual modes, per-item prepared/leftover/plate waste/unknown/shortage, unit-aware validation, live served/consumed preview, POST.
- [ ] `MealRecordDetailPage`: record table, waste summary from `/waste-summary`, backend `logging_drafts` actions to waste form.

## Phase 5 — Scanner + Waste

- [ ] `ScannerPage`: drag/drop/camera upload, MIME/size validation, preview, POST multipart `/vision/predict`, results (prediction, classification confidence, alternatives, count/status/warnings/model), box overlay, food correction + recount, quantity confirmation, handoff to waste form.
- [ ] `WasteLogsPage`: filters (type/status/food/date), pagination via limit/offset, authenticated thumbnails, safety badges.
- [ ] `WasteLogFormPage`: manual/scanner/meal-draft modes, exact safety fields, tri-state unknowns, POST/PATCH, safety result panel.
- [ ] `WasteLogDetailPage`: full detail, safety screening reasons/policy/deadline/available quantity, re-check form, edit link.
- [ ] Shared `SafetyScreeningPanel`, `AuthenticatedImage`.

## Phase 6 — Analytics, Recommendations, Delivery, Placeholders

- [ ] `AnalyticsPage`: filters, weighted unitless headline rates, per-unit charts, legacy-mode separation, insights cards, insufficient-history and acceptance-proxy notes.
- [ ] `PortionRecommendationsPage`: filters incl. forecast, advisory table/cards, per-attendee clarification.
- [ ] `DeliveryPage`: active/inactive personnel list, add/edit/deactivate/reactivate, confirm dialog, unavailable assignments section.
- [ ] `DonationsPage`: honest unavailable state; no fake data.

## Phase 7 — Verification + Docs

- [ ] Run `npm run lint`, `npm run build`.
- [ ] Exercise live endpoints used by services with the dev account; record results.
- [ ] Responsive/manual review of all pages; fix defects.
- [ ] Write `docs/frontend-kitchen-workspace.md` (features, routes, API map, limitations, run instructions).
- [ ] Atomic local commits; verify `git status` and no backend/ML changes.

## Review Focus

1. Null plate waste must remain unknown end-to-end; never render or submit as 0.
2. Piece-based quantities must stay whole and never be merged with servings.
3. Missing kitchen (404) must route to setup, not error out.
4. Expired token (401) must clear session and return to login without loops.
5. Safety PENDING must show backend reasons, not bypass or auto-confirm.

## Verification Commands

```bash
cd frontend
npm run lint
npm run build
```
