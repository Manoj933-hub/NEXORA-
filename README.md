# NEXORA

NEXORA is a modern healthcare SaaS platform designed for independent doctors and small clinics in India and Nepal.

---

## Confirmed Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Database**: PostgreSQL 17
- **ORM**: Prisma ORM 6.19
- **Package Manager**: npm
- **Testing**: Vitest with React SSR validation
- **Version Control**: Git

---

## Prerequisites

- **Node.js**: `v20.9.0` or later (tested and verified on `v20.20.2`)
- **PostgreSQL**: `17.x` installed and running locally on port `5432`
- **npm**: `10.x` or later

---

## Environment Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Configure `DATABASE_URL` in `.env`:
   ```env
   DATABASE_URL="postgresql://username:password@localhost:5432/nexora?schema=public"
   ```
   *Note: For local Homebrew PostgreSQL setups that connect without password over socket/localhost, you can use `postgresql://<your_system_username>@localhost:5432/nexora?schema=public`.*

   > **Security Notice**: `.env` is ignored by Git and must never be committed. `.env.example` provides sanitized template values only.

---

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Generate the Prisma client:**
   ```bash
   npx prisma generate
   ```

3. **Start the local development server:**
   ```bash
   npm run dev
   ```

4. **Access the application:**
   - Landing page: [http://localhost:3000](http://localhost:3000)
   - Health check: [http://localhost:3000/api/health](http://localhost:3000/api/health)

---

## Health Check Endpoint

`GET /api/health` reports the application status and database connectivity safely without exposing sensitive connection strings or credentials.

### Example Response (Healthy - 200 OK):
```json
{
  "status": "healthy",
  "timestamp": "2026-10-22T01:13:00.000Z",
  "environment": "development",
  "services": {
    "database": {
      "status": "connected",
      "latencyMs": 3
    }
  }
}
```

### Example Response (Degraded - 503 Service Unavailable):
```json
{
  "status": "degraded",
  "timestamp": "2026-10-22T01:13:00.000Z",
  "environment": "development",
  "services": {
    "database": {
      "status": "disconnected"
    }
  }
}
```

---

## Verification & Quality Checks

Run the following scripts to verify code health:

- **Run Automated Tests**:
  ```bash
  npm run test
  ```
- **Run TypeScript Check**:
  ```bash
  npx tsc --noEmit
  ```
- **Run ESLint**:
  ```bash
  npm run lint
  ```
- **Build for Production**:
  ```bash
  npm run build
  ```
