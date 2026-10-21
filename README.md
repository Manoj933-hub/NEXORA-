# NEXORA

NEXORA is a modern healthcare SaaS platform designed for independent doctors and small clinics in India and Nepal.

---

## Confirmed Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Database**: PostgreSQL 17
- **ORM**: Prisma ORM 6.19
- **Validation**: Zod
- **Security**: Bcrypt.js, SHA-256 database-backed sessions, HttpOnly cookies, PostgreSQL rate limiter
- **Package Manager**: npm
- **Testing**: Vitest with unit and database integration testing
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

2. **Run database migrations:**
   ```bash
   npx prisma migrate dev
   ```

3. **Generate the Prisma client:**
   ```bash
   npx prisma generate
   ```

4. **Start the local development server:**
   ```bash
   npm run dev
   ```

5. **Access the application:**
   - Landing page: [http://localhost:3000](http://localhost:3000)
   - Health check: [http://localhost:3000/api/health](http://localhost:3000/api/health)

---

## Authentication & Multi-Tenant Architecture (Task 002)

### 1. Database-Backed Sessions
- Authentication issues a 256-bit cryptographically secure random token.
- Only the **SHA-256 hash** of the token is saved in PostgreSQL (`sessions` table).
- Raw token is delivered via an `HttpOnly`, `SameSite=Lax`, `Secure` (in production) cookie (`nexora_session`).
- Revocation deletes the session record from the database.

### 2. Multi-Instance Rate Limiting
- Login and registration attempts are tracked directly in the PostgreSQL database (`auth_rate_limits` table).
- Eliminates memory-leak issues and functions reliably across clustered/serverless instances.

### 3. Role-Based Access Control (RBAC)
- **`OWNER`**: Full clinic ownership, subscription/billing, deletion, member management.
- **`ADMIN`**: Clinic configuration, member invitations, and operational management.
- **`DOCTOR`**: Clinical consultations, records, prescriptions, and patient care.
- **`RECEPTIONIST`**: Appointment scheduling, queue management, and patient intake.
- **`STAFF`**: Basic operational read-only access.

### 4. Tenant Isolation
- Client-supplied clinic IDs are strictly verified against the database.
- `requireClinicAccess(request, clinicId, { requiredPermission })` guarantees:
  1. Authenticated user exists and is active.
  2. User holds an active `Membership` in the target `Clinic`.
  3. Clinic tenant is active.
  4. Role possesses the requested permission.
- **Cross-clinic requests are immediately rejected with HTTP 403 Forbidden.**

---

## API Endpoints

### System
- `GET /api/health` - Application and database status.

### Authentication
- `POST /api/auth/register` - Atomically registers user, clinic, and OWNER membership.
- `POST /api/auth/login` - Authenticates credentials with rate limiting and sets session cookie.
- `POST /api/auth/logout` - Revokes session and clears cookie.
- `GET /api/auth/me` - Returns current user, active clinic, and authorized clinics list.
- `POST /api/auth/switch-clinic` - Switches active clinic context with server-side validation.

### Clinic Organizations
- `GET /api/clinics/[clinicId]` - Protected tenant profile with role and member statistics.

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
