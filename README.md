# NEXORA

NEXORA is a modern, multi-tenant healthcare software-as-a-service (SaaS) platform built for independent doctors, outpatient clinics, and polyclinics in India and Nepal. Designed for high efficiency and data isolation, NEXORA streamlines patient intake, appointment scheduling, clinical operations, and practice management through a clean, responsive web interface.

---

## 1. Project Introduction

NEXORA addresses the unique operational realities of healthcare practices in South Asia:

- **Independent Practitioners & Polyclinics**: Support for solo doctors and multi-practitioner clinics with role-based access.
- **Strict Multi-Tenancy**: Complete logical isolation of clinic data, ensuring patients, bookings, and clinical information are accessible only to authorized clinic personnel.
- **Regional Localization**: Built with support for regional practice structures, contact patterns, and multi-currency handling (Indian Rupee `INR` and Nepalese Rupee `NPR`).
- **Low Operational Overhead**: Fast, server-driven architecture with optimistic UI patterns, responsive layout, and robust security defaults.

---

## 2. Project Status

NEXORA is in active development. Foundations through **Task 004** are fully implemented, verified, and backed by automated integration tests:

| Milestone | Scope | Status |
| :--- | :--- | :--- |
| **Task 001** | Core architecture, Next.js 16 + Tailwind CSS 4, PostgreSQL schema, health endpoint | Completed |
| **Task 002** | Secure authentication, SHA-256 session token hashing, database rate limiting, tenant isolation, RBAC | Completed |
| **Task 003** | Clinic onboarding wizard, multi-clinic switcher, protected dashboard shell, role-aware navigation | Completed |
| **Task 004** | Clinic-scoped patient management, unique MRN generation, appointment scheduling, doctor conflict detection, reception queue | Completed |
| **Task 005** | Clinical records, consultation notes (SOAP), vitals tracking, digital prescriptions | Planned |

> **Development Notice**: NEXORA is currently in development. While security controls, tenant isolation, and automated tests are rigorously maintained, formal healthcare regulatory assessments (such as ABDM M1/M2/M3 certification in India) have not yet been conducted. Do not deploy to production medical environments without completing formal compliance and security audits.

---

## 3. Technology Stack

NEXORA is built with modern, production-grade web technologies:

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js | 16.4.2 | App Router, React Server Components, server actions, route handlers |
| **UI Library** | React | 19.3.0 | Modern concurrent React with Turbopack support |
| **Language** | TypeScript | 5.x | Strict end-to-end type safety |
| **Styling** | Tailwind CSS | 4.x | Utility-first CSS engine with `@tailwindcss/turbopack` |
| **Database** | PostgreSQL | 17.x | Relational storage with ACID guarantees and foreign key constraints |
| **ORM** | Prisma | 6.19.3 | Type-safe schema migrations, queries, and connection pooling |
| **Validation** | Zod | 4.6.7 | Strict schema validation for API inputs, route params, and mutations |
| **Authentication** | Bcrypt.js & Web Crypto | 3.0.3 | Password hashing (salt rounds = 10) and cryptographically random session tokens |
| **Testing** | Vitest | 4.1.12 | Fast unit and database integration test runner |
| **Package Manager**| npm | 10.x+ | Dependency management and build scripts |

---

## 4. Core Features

### Implemented Features (Tasks 001–004)
- **Multi-Tenant Clinic Management**: Create and manage isolated clinic workspaces with custom slugs, addresses, and country-specific settings.
- **Multi-Clinic Context Switching**: Clinicians and staff belonging to multiple clinics can seamlessly switch between practice workspaces.
- **Secure Authentication**: Email/password registration with atomic clinic setup, credential login, secure logout, and session introspection (`/api/auth/me`).
- **Distributed Rate Limiting**: Database-backed request tracking defending against brute-force attacks on authentication endpoints.
- **Clinic-Scoped Patient Directory**: Demographic profiles, contact information, blood groups, known allergies, baseline clinical notes, and search/filtering.
- **Automated MRN Generation**: Sequential, zero-padded Medical Record Numbers (e.g., `NX-0001`) unique to each clinic.
- **Appointment Scheduling**: Clinic-scoped booking with start/end time validation, timezone-safe UTC timestamps, and doctor conflict detection (HTTP 409).
- **Appointment State Machine**: Validated transitions (`SCHEDULED` -> `CHECKED_IN` -> `IN_PROGRESS` -> `COMPLETED`, terminal `CANCELLED`) with automatic audit timestamps.
- **Reception Intake Queue**: Live lobby dashboard tracking today's arrivals with one-click status updates and real-time status counters.
- **Role-Aware Dashboard UI**: Unified responsive navigation adapting accessible actions according to the user's role.

---

## 5. Authentication and Account Security

NEXORA employs defense-in-depth security principles across all authentication and session layers:

1. **Atomic Registration**:
   Registration (`POST /api/auth/register`) executes in an isolated database transaction, creating the `User`, the initial `Clinic`, and the `Membership` with the `OWNER` role simultaneously. Partial registrations are impossible.

2. **Database-Backed Session Tokens**:
   - Login generates a 256-bit cryptographically secure random token (`crypto.randomBytes(32)`).
   - Only the **SHA-256 hash** of the token is persisted in PostgreSQL (`sessions.token_hash`).
   - The raw token is returned exclusively to the client via an `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` (in production) cookie (`nexora_session`).
   - Even in the event of an unauthorized database read, active session tokens cannot be derived from stored hashes.

3. **Multi-Instance Rate Limiting**:
   - Authentication endpoints are throttled using PostgreSQL (`auth_rate_limits` table).
   - Rate limits persist across server restarts, serverless invocations, and multiple horizontal container instances.
   - Separate rate limits apply to registration (10 requests/hour per IP) and login (5 attempts/15 minutes per IP + email).

4. **CSRF & Origin Verification**:
   - State-changing requests (`POST`, `PATCH`, `PUT`, `DELETE`) require a valid `Origin` or `Referer` header matching the application host.
   - Missing or mismatched cross-origin requests are rejected with `403 Forbidden`.

---

## 6. Clinic Onboarding and Multi-Clinic Management

NEXORA supports complex organizational relationships where healthcare workers may consult across several practices:

- **Onboarding Flow (`/onboarding`)**: Authenticated users without a clinic or looking to register a new practice can enter clinic details, country (`IN` or `NP`), currency (`INR` or `NPR`), and practice contact information.
- **Clinic Selection (`/select-clinic`)**: Users with multiple clinic memberships can switch active contexts. The active clinic is recorded in the user's database session record.
- **Context Verification (`POST /api/auth/switch-clinic`)**: Ensures the user holds an active membership in the target clinic before updating the session's `active_clinic_id`.
- **Clinic Settings (`/dashboard/settings`)**: Clinic owners and administrators can update practice demographics, contact numbers, and operational addresses.

---

## 7. Role-Based Access Control (RBAC)

NEXORA enforces strict hierarchical role-based permissions at the API route handler level.

### Defined Roles

| Role | Hierarchy Level | Primary Responsibilities |
| :--- | :---: | :--- |
| **`OWNER`** | 50 | Full legal and operational clinic ownership, deletion, subscription, practitioner management. |
| **`ADMIN`** | 40 | Practice operations, member invitations, clinic profile settings, operational workflows. |
| **`DOCTOR`** | 30 | Clinical consultations, medical records, electronic prescriptions, appointment schedule. |
| **`RECEPTIONIST`** | 20 | Front-desk patient intake, appointment scheduling, lobby queue management. |
| **`STAFF`** | 10 | General operational support with basic read-only access. Restricted from clinical records or modifying patients. |

### Granular Permission Matrix

```
┌─────────────────────────────────┬───────┬───────┬────────┬──────────────┬───────┐
│ Permission                      │ OWNER │ ADMIN │ DOCTOR │ RECEPTIONIST │ STAFF │
├─────────────────────────────────┼───────┼───────┼────────┼──────────────┼───────┤
│ clinic:read                     │   ✓   │   ✓   │   ✓    │      ✓       │   ✓   │
│ clinic:update                   │   ✓   │   ✓   │   -    │      -       │   -   │
│ clinic:delete                   │   ✓   │   -   │   -    │      -       │   -   │
│ members:read                    │   ✓   │   ✓   │   ✓    │      ✓       │   ✓   │
│ members:manage                  │   ✓   │   ✓   │   -    │      -       │   -   │
│ patients:read                   │   ✓   │   ✓   │   ✓    │      ✓       │   -   │
│ patients:write                  │   ✓   │   ✓   │   ✓    │      ✓       │   -   │
│ reception:appointments:manage   │   ✓   │   ✓   │   ✓    │      ✓       │   -   │
│ reception:queue:manage          │   ✓   │   ✓   │   ✓    │      ✓       │   -   │
│ clinical:records:read           │   ✓   │   ✓   │   ✓    │      -       │   -   │
│ clinical:records:write          │   ✓   │   ✓   │   ✓    │      -       │   -   │
└─────────────────────────────────┴───────┴───────┴────────┴──────────────┴───────┘
```

The authorization helper `requireClinicAccess(req, clinicId, { requiredPermission, requiredRole })` executes before every tenant data operation, ensuring the caller has an active user account, an active clinic membership, and sufficient permissions.

---

## 8. Patient Management

Patient records are strictly scoped to the active clinic organization (`Patient.clinicId`).

- **Unique Patient Identifier (MRN)**: Each patient receives an auto-generated Medical Record Number (e.g., `NX-0001`, `NX-0002`) guaranteed unique within the clinic (`@@unique([clinicId, mrn])`).
- **Demographic Profile**: Name, date of birth, age computation, gender (`MALE`, `FEMALE`, `OTHER`), primary phone, email, address, and emergency contact.
- **Clinical Baseline**: Blood group (`A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`), drug and environmental allergies, and baseline medical notes.
- **Directory Search & Pagination**:
  - `GET /api/patients?query=<term>&page=1&limit=15`
  - Real-time search across `name`, `phone`, and `mrn` using database-indexed queries.
  - Paginated responses returning items, total count, and total pages.
- **Patient Detail & Edit**:
  - Dedicated profile view at `/dashboard/patients/[patientId]`.
  - Comprehensive appointment history showing past visits, assigned practitioners, and statuses.
  - Inline editing of contact details, address, allergies, and clinical notes.
- **Data Minimization**: Avoids collection of extraneous sensitive identifiers.

---

## 9. Appointment Management

The appointment engine handles clinic scheduling with conflict detection:

- **Same-Clinic Association**: Appointments strictly verify that the patient and practitioner belong to the caller's active clinic.
- **Doctor Conflict Detection**:
  When scheduling (`POST /api/appointments`) or rescheduling (`PATCH /api/appointments/[appointmentId]`) with an assigned doctor, NEXORA checks for overlapping appointments for that practitioner:
  ```
  Existing.startTime < New.endTime AND Existing.endTime > New.startTime
  ```
  Overlapping bookings return an immediate `409 Conflict` error to prevent double-booking.
- **Timezone & Boundary Handling**:
  All start and end times are stored in UTC (`ISO 8601`). The validation schema enforces that `endTime` must be strictly later than `startTime`.
- **State Machine Transitions**:
  Appointments progress through validated operational states:
  ```
  [SCHEDULED] ────────► [CHECKED_IN] ────────► [IN_PROGRESS] ────────► [COMPLETED]
       │                      │                      │
       └──────────────────────┴──────────────────────┴─────────────► [CANCELLED]
  ```
  - Retroactive transitions (e.g., `COMPLETED` back to `SCHEDULED`) are rejected with `400 Bad Request`.
  - Cancellations record the cancellation reason (`cancelledReason`).
  - Arrival, consultation start, and completion timestamps (`checkedInAt`, `inProgressAt`, `completedAt`) are recorded automatically.

---

## 10. Reception Queue

The reception intake queue (`/dashboard/queue`) serves as the front-desk operational hub:

- **Lobby View**: Displays all appointments scheduled for the selected date (defaults to today).
- **Queue Metrics**: Real-time summary cards display counters for:
  - Total Appointments
  - Waiting / Scheduled
  - Checked In (Arrived in lobby)
  - In Consultation
  - Completed
  - Cancelled
- **One-Click Actions**: Front-desk staff can mark patients as `CHECKED_IN` upon arrival or move them to `IN_PROGRESS` when called into the doctor's chamber.

---

## 11. Clinical Records Roadmap

Task 005 will expand NEXORA into a comprehensive Electronic Medical Record (EMR) system. The placeholder dashboard view at `/dashboard/records` provides a clear roadmap of planned functionality:

- **Consultation Notes**: Structured SOAP documentation (Subjective, Objective, Assessment, Plan).
- **Vitals Tracking**: Blood pressure, pulse, temperature, respiratory rate, SpO2, height, weight, and automated BMI calculations.
- **Diagnosis Coding**: Diagnostic tagging supporting standard ICD-10 codes and practice-defined clinical terms.
- **Digital Prescriptions (Rx)**: Drug database lookup, dosage instructions, frequency, duration, food relationships, and print-ready prescription layouts.

---

## 12. Architecture and Data Isolation

NEXORA enforces strict multi-tenancy at the data layer:

```
                    ┌──────────────────────────┐
                    │      Client Request      │
                    └─────────────┬────────────┘
                                  │ (Cookie: nexora_session)
                                  ▼
                    ┌──────────────────────────┐
                    │   Tenant Isolation Wall  │
                    │  (requireClinicAccess)   │
                    └─────────────┬────────────┘
                                  │
         ┌────────────────────────┴────────────────────────┐
         │                                                 │
         ▼                                                 ▼
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│        Clinic A Tenant          │       │        Clinic B Tenant          │
├─────────────────────────────────┤       ├─────────────────────────────────┤
│ • Patients (clinic_id = A)      │       │ • Patients (clinic_id = B)      │
│ • Appointments (clinic_id = A)  │       │ • Appointments (clinic_id = B)  │
│ • Memberships (clinic_id = A)   │       │ • Memberships (clinic_id = B)   │
└─────────────────────────────────┘       └─────────────────────────────────┘
```

1. **Foreign Key Enforcement**: All clinic-scoped tables (`patients`, `appointments`, `memberships`) feature non-nullable foreign keys to `clinics.id` with cascading deletion.
2. **Explicit Filtering**: Every database query explicitly qualifies records by `clinicId`.
3. **No Blind Trust**: Client-provided IDs (`clinicId`, `patientId`, `appointmentId`) are resolved against database ownership records before any read or write operation is permitted.
4. **Cross-Tenant Rejection**: Attempting to access or link records across clinics immediately triggers an `HTTP 403 Forbidden` or `HTTP 404 Not Found` response.

---

## 13. Project Structure

```
NEXORA/
├── prisma/
│   ├── migrations/
│   │   ├── 20261021200848_init_auth_clinics_roles/
│   │   │   └── migration.sql
│   │   └── 20261021210203_add_patients_and_appointments/
│   │       └── migration.sql
│   ├── migration_lock.toml
│   └── schema.prisma                 # Database schema models & enums
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── appointments/         # List & book appointments
│   │   │   │   ├── [appointmentId]/  # Reschedule, cancel, update status
│   │   │   │   ├── appointments.test.ts
│   │   │   │   └── route.ts
│   │   │   ├── auth/                 # Authentication endpoints
│   │   │   │   ├── login/
│   │   │   │   ├── logout/
│   │   │   │   ├── me/
│   │   │   │   ├── register/
│   │   │   │   ├── switch-clinic/
│   │   │   │   └── auth.test.ts
│   │   │   ├── clinics/              # Clinic organization management
│   │   │   │   ├── [clinicId]/
│   │   │   │   │   ├── members/      # List clinic practitioners
│   │   │   │   │   └── route.ts
│   │   │   │   ├── clinics.test.ts
│   │   │   │   ├── onboarding.test.ts
│   │   │   │   └── route.ts
│   │   │   ├── health/               # System health probe
│   │   │   │   ├── route.test.ts
│   │   │   │   └── route.ts
│   │   │   ├── patients/             # Patient directory & registration
│   │   │   │   ├── [patientId]/      # Patient profile & edit
│   │   │   │   ├── patients.test.ts
│   │   │   │   └── route.ts
│   │   │   └── queue/                # Reception intake queue & metrics
│   │   │       ├── queue.test.ts
│   │   │       └── route.ts
│   │   ├── dashboard/                # Protected clinic dashboard
│   │   │   ├── appointments/         # Appointment management & booking UI
│   │   │   ├── patients/             # Patient directory, intake, & profile UI
│   │   │   ├── queue/                # Reception queue board UI
│   │   │   ├── records/              # Clinical records roadmap notice
│   │   │   ├── settings/             # Clinic profile & settings UI
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── login/                    # Login page
│   │   ├── onboarding/               # Clinic creation wizard
│   │   ├── register/                 # User registration page
│   │   ├── select-clinic/            # Multi-clinic switcher page
│   │   ├── globals.css               # Global Tailwind CSS 4 directives
│   │   ├── layout.tsx                # Root layout
│   │   └── page.tsx                  # Public landing page
│   ├── components/
│   │   └── dashboard/
│   │       ├── dashboard-shell.tsx   # Dashboard context provider & layout shell
│   │       ├── header.tsx            # Clinic switcher & user menu
│   │       ├── role-badge.tsx        # Styled role status indicator
│   │       ├── sidebar.tsx           # Role-filtered navigation links
│   │       └── dashboard.test.tsx
│   └── lib/
│       ├── auth/
│       │   ├── csrf.ts               # Origin/Referer CSRF protection
│       │   ├── password.ts           # Bcrypt hashing & verification
│       │   ├── permissions.ts        # RBAC roles & permission matrix
│       │   ├── rate-limiter.ts       # PostgreSQL-backed rate limiter
│       │   ├── session.ts            # Crypto tokens & session management
│       │   └── tenant.ts             # Clinic isolation & access guards
│       ├── patients/
│       │   └── mrn.ts                # Clinic MRN sequence generator
│       ├── validations/
│       │   ├── appointment.ts        # Appointment Zod schemas & state machine
│       │   ├── auth.ts               # Login/registration Zod schemas
│       │   ├── clinic.ts             # Clinic Zod schemas
│       │   └── patient.ts            # Patient demographic Zod schemas
│       └── prisma.ts                 # Global Prisma client singleton
├── .env.example                      # Sanitized environment variable template
├── .gitignore                        # Git ignore patterns (protects .env)
├── next.config.ts                    # Next.js configuration
├── package.json                      # Project dependencies & scripts
├── tsconfig.json                     # TypeScript configuration
└── vitest.config.ts                  # Vitest test runner configuration
```

---

## 14. Prerequisites

Ensure the following runtimes and services are available on your system:

- **Node.js**: `v20.9.0` or higher (verified on Node.js `v20.x`)
- **PostgreSQL**: Version `17.x` running locally or accessible via network (default port: `5432`)
- **npm**: Version `10.x` or higher
- **Git**: For version control

---

## 15. Local Development Setup

Follow these steps to set up NEXORA for local development:

### 1. Clone the Repository
```bash
git clone https://github.com/Manoj933-hub/NEXORA-.git
cd NEXORA-
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure the Environment
Create your local environment file from the sanitized template:
```bash
cp .env.example .env
```

Configure `DATABASE_URL` in `.env` with your PostgreSQL credentials:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/nexora?schema=public"
NODE_ENV="development"
```

> **Security Note**: The `.env` file is excluded from Git via `.gitignore`. Never commit `.env` or expose production database credentials in version control.

### 4. Create the Database & Apply Migrations
Ensure PostgreSQL is running, then apply the migrations:
```bash
npx prisma migrate dev
```

### 5. Generate the Prisma Client
```bash
npx prisma generate
```

### 6. Start the Development Server
```bash
npm run dev
```

The application will be accessible at:
- **Web Application**: [http://localhost:3000](http://localhost:3000)
- **Health Check Probe**: [http://localhost:3000/api/health](http://localhost:3000/api/health)

---

## 16. Verification and Testing

NEXORA includes an automated test suite covering authentication, tenant isolation, role-based access, patient workflows, and appointment scheduling.

### 1. Run Automated Tests
```bash
npm run test
```
*Executes all 14 test suites in Vitest (89 tests passing).*

### 2. Run TypeScript Typechecking
```bash
npx tsc --noEmit
```
*Verifies type safety across all components, API handlers, and utilities with zero diagnostics.*

### 3. Run Code Linting
```bash
npm run lint
```
*Runs ESLint against all source files with zero errors or warnings.*

### 4. Build for Production
```bash
npm run build
```
*Compiles an optimized production build using Turbopack, validating both static and dynamic routes.*

---

## 17. Database Migrations

NEXORA manages database schema migrations using Prisma.

### Applying Migrations During Development
```bash
npx prisma migrate dev
```
This updates the database schema and automatically regenerates the Prisma client.

### Deploying Migrations to Staging/Production
```bash
npx prisma migrate deploy
```
Applies pending migrations without modifying schema files or resetting data.

### Existing Migrations

| Migration Name | Applied Changes |
| :--- | :--- |
| `20261021200848_init_auth_clinics_roles` | Created `users`, `clinics`, `memberships`, `sessions`, and `auth_rate_limits` tables with indexes and foreign keys. |
| `20261021210203_add_patients_and_appointments` | Added `patients` table, `appointments` table, and `AppointmentStatus` enum with multi-tenant unique indexes. |

> **Warning**: Never run `npx prisma migrate reset` on production or staging databases, as this permanently drops all existing records.

---

## 18. Security Considerations

NEXORA is engineered to safeguard sensitive healthcare and administrative information:

- **Data Isolation**: Multi-tenant constraints ensure that a practitioner or staff member from Clinic A cannot view, query, or modify patient or appointment records belonging to Clinic B.
- **Protection of Stored Credentials**: Passwords are never stored in plaintext. They are salted and hashed using Bcrypt.
- **Opaque Session Tokens**: Active session tokens are stored as SHA-256 hashes in PostgreSQL.
- **Protection Against Brute-Force Attacks**: PostgreSQL-backed rate limiting protects login and registration endpoints.
- **No PHI in Logs**: Application logs exclude patient health information, demographic identifiers, session cookies, and authentication payloads.
- **Compliance Disclaimer**: NEXORA is currently undergoing developmental verification. Formal compliance certifications (e.g., ABDM compliance under the National Health Authority of India, HIPAA assessment, or ISO 27001) must be independently completed before handling live clinical patient data in regulated jurisdictions.

---

## 19. Development Roadmap

```
  Task 001: Core Architecture & PostgreSQL Setup   [✓ Completed]
  Task 002: Authentication, Sessions & RBAC         [✓ Completed]
  Task 003: Clinic Onboarding & Dashboard Shell    [✓ Completed]
  Task 004: Patient Management & Appointments      [✓ Completed]
  Task 005: Clinical Records, SOAP Notes & Rx      [● Planned]
  Task 006: Invoicing & Multi-Currency Billing     [○ Planned]
  Task 007: SMS & WhatsApp Patient Notifications   [○ Planned]
  Task 008: ABDM Interoperability & Audit Logging  [○ Planned]
```

---

## 20. Contributing

Contributions are welcome. Please adhere to the following workflow:

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes adhering to existing code conventions and tenant isolation patterns.
3. Ensure all tests and static analysis checks pass:
   ```bash
   npm run test
   npx tsc --noEmit
   npm run lint
   npm run build
   ```
4. Submit a clear pull request detailing the changes and testing steps.

---

## 21. Repository Link

GitHub Repository: [https://github.com/Manoj933-hub/NEXORA-](https://github.com/Manoj933-hub/NEXORA-)
