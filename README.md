# AnnaChakra

**AI-Powered Food Waste Reduction and Redistribution Platform**

AnnaChakra is an intelligent food management platform designed to help institutional kitchens reduce food waste through demand forecasting, computer vision-assisted waste logging and surplus food redistribution.

The system learns from historical kitchen records to provide personalized food preparation recommendations and connects eligible surplus food with verified NGOs based on their requirements, capacity and location.

## Features

### Kitchen Portal

- Kitchen registration and profile management.
- AI-powered dish-wise demand forecasting.
- Attendance-based food preparation recommendations.
- Ingredient quantity calculation.
- Historical meal and consumption tracking.
- Computer vision-assisted food waste logging.
- Surplus food safety screening.
- Location-based NGO matching.
- Donation and delivery personnel management.
- Food waste and consumption analytics.

### NGO Portal

- NGO registration and profile management.
- Food requirement and receiving capacity management.
- Incoming donation requests.
- Donation acceptance and rejection.
- Delivery status tracking.
- Food receipt confirmation.
- Donation history.

### Admin Portal

- Kitchen and NGO verification.
- Food catalogue management.
- Platform activity monitoring.
- Food redistribution and impact analytics.
- ML model performance monitoring.

### Machine Learning

- XGBoost-based demand forecasting.
- Kitchen-specific historical demand analysis.
- MobileNetV2-based food image classification.
- Adaptive learning from historical meal records.
- Model evaluation and version management.

## Technology Stack

| Layer            | Technologies                           |
| ---------------- | -------------------------------------- |
| Frontend         | React, Vite, Tailwind CSS, Axios       |
| Backend          | FastAPI, Python 3.12, SQLAlchemy       |
| Database         | PostgreSQL, Alembic                    |
| Machine Learning | XGBoost, Scikit-learn, Pandas, NumPy   |
| Computer Vision  | TensorFlow, Keras, MobileNetV2, OpenCV |
| Authentication   | JWT, Argon2                            |
| Visualization    | Recharts, Leaflet                      |
| Testing & CI     | Pytest, ESLint, GitHub Actions         |

## Project Structure

```text
AnnaChakra/
├── .github/
│   └── workflows/
│       └── ci.yml
├── backend/
│   ├── alembic/
│   ├── app/
│   │   ├── core/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── routers/
│   │   ├── services/
│   │   ├── utils/
│   │   └── main.py
│   ├── scripts/
│   ├── tests/
│   ├── alembic.ini
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── context/
│   │   └── utils/
│   ├── package.json
│   └── .env.example
├── ml/
├── docs/
├── .gitignore
└── README.md
```

## Project Setup

### Prerequisites

- Python 3.12
- Node.js 22+
- PostgreSQL
- npm
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/Madhurashastry14/AnnaChakra.git
cd AnnaChakra
```

### 2. Create a Virtual Environment

**Windows**

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**Linux/macOS**

```bash
python3.12 -m venv .venv
source .venv/bin/activate
```

### 3. Install Backend Dependencies

```bash
pip install -r backend/requirements.txt
```

### 4. Create the Database

Connect to PostgreSQL:

```bash
psql -U postgres
```

Create the database:

```sql
CREATE DATABASE annachakra;
```

Exit PostgreSQL:

```sql
\q
```

### 5. Configure Backend Environment Variables

Create a `.env` file inside the `backend/` directory using
`.env.example` as a reference.

```env
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/annachakra
SECRET_KEY=YOUR_SECRET_KEY
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

Generate a secure secret key:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Replace the placeholder values with your local credentials.

### 6. Apply Database Migrations

```bash
cd backend
python -m alembic upgrade head
```

### 7. Seed Initial Data

Create an administrator account:

```bash
python -m scripts.seed_admin --help
```

Follow the supported arguments to create the admin account.

Seed the food catalogue once the module is available:

```bash
python -m scripts.seed_food_items
```

### 8. Start the Backend

From the `backend/` directory:

```bash
python -m uvicorn app.main:app --reload
```

| Service      | URL                          |
| ------------ | ---------------------------- |
| Backend      | http://localhost:8000        |
| Swagger UI   | http://localhost:8000/docs   |
| ReDoc        | http://localhost:8000/redoc  |
| Health Check | http://localhost:8000/health |

### 9. Set Up the Frontend

Open a new terminal from the project root:

```bash
cd frontend
npm install
```

Create a `.env` file inside the `frontend/` directory:

```env
VITE_API_URL=http://localhost:8000
```

Start the frontend:

```bash
npm run dev
```

Frontend: http://localhost:5173

### 10. Run Tests

**Backend**

From the project root, with the virtual environment activated:

```bash
cd backend
pip install pytest httpx
python -m pytest tests -v
```

**Frontend**

From the project root:

```bash
cd frontend
npm run lint
npm run build
```

## Development Notes

- Do not commit environment files, credentials, raw datasets
  or large model artifacts.
- Apply the latest database migrations after pulling changes.
- Ensure CI checks pass before merging pull requests.
- Some forecasting, computer vision and redistribution
  features are currently under development.
- Food quantity predictions and recipe recommendations are
  estimates. Food redistribution requires human verification
  and appropriate food safety procedures.

---

**AnnaChakra — Predict Better. Waste Less. Share More.**
