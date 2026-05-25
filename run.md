# Setup and Execution Guide

This document outlines the exact steps required to install dependencies, start the PostgreSQL database, build the project, run the local development server, access Swagger, and execute the automated test suites.

---

<!-- SECTION 1: INSTALLATION -->

## 1. Install Dependencies

Before starting the application, install all required npm packages:

```bash
npm install
```

---

<!-- SECTION 2: ENVIRONMENT VARIABLES -->

## 2. Environment Variables (Optional)

Create a `.env` file in the project root if you want to override the default database configuration:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=issueflow
DB_PASSWORD=issueflow
DB_NAME=issueflow
```

If no `.env` file is provided, the application uses the default values shown above.

**Note:** For this assignment, the JWT configuration is defined inside the application module, so no additional JWT environment variables are required.

---

<!-- SECTION 3: DATABASE SETUP -->

## 3. Start the Database

The project uses PostgreSQL for data persistence. Start the database container in detached mode using Docker Compose:

```bash
docker compose up -d
```

**Note:** Make sure Docker Desktop is open and running before executing this command.

---

<!-- SECTION 4: BUILD -->

## 4. Build the Project

Before running the application or submitting the project, build the TypeScript source code:

```bash
npm run build
```

A successful build confirms that the project compiles correctly.

---

<!-- SECTION 5: RUN APPLICATION -->

## 5. Run the Application

To launch the application in development mode with hot reload enabled, run:

```bash
npm run start:dev
```

Once the server starts, the local API is available at:

```text
http://localhost:3000
```

The interactive Swagger documentation is available at:

```text
http://localhost:3000/api
```

---

<!-- SECTION 6: TESTING -->

## 6. Run the Tests

To verify system functionality, API integrity, and key business rules, run the automated test suites.

### Unit Tests

```bash
npm run test
```

### End-to-End Tests

```bash
npm run test:e2e
```

If tests fail due to leftover database data from previous runs, reset the database and try again:

```bash
docker compose down -v
docker compose up -d
```

Then run the relevant test command again.

---

<!-- SECTION 7: TECHNICAL NOTES -->

## Technical Notes and Architectural Insights

### 1. API Response Status: `201 Created` vs `200 OK`

The README API contract defines the expected response status for the implemented endpoints.

Several `POST` endpoints in this project explicitly return `200 OK` using `@HttpCode(200)` in order to match the assignment API contract.

The E2E tests therefore expect `200 OK` for create and login flows where the README specifies `200 OK`.

---

### 2. Robust Date Parsing for `isOverdue`

HTTP requests transfer date values as ISO-8601 string values.

The ticket overdue evaluation logic inside `TicketsService` safely converts incoming `dueDate` values using:

```typescript
new Date(ticket.dueDate)
```

This ensures consistent runtime behavior when evaluating overdue tickets, both for database entities and incoming request payloads.

---

<!-- SECTION 8: TROUBLESHOOTING -->

## Troubleshooting: TypeScript E2E Testing Imports

During development, module resolution differences between TypeScript, Jest, VS Code, and `supertest` may cause import compatibility issues in E2E tests.

This does not change the application logic, but it may affect how the test files import `supertest`.

### Possible Symptoms

1. The IDE shows a warning or underline under the `supertest` import or the `request` function.
2. Running the E2E tests fails with an error similar to:

```bash
TypeError: (0, supertest_1.default) is not a function
```

### Recommended Handling

If the E2E tests pass in the terminal with the following import style, it can remain as is:

```typescript
import * as request from 'supertest';
```

If the test suite fails at runtime with the `supertest_1.default is not a function` error, use the CommonJS-compatible import style instead:

```typescript
import request = require('supertest');
```

The important validation point is that the following command completes successfully:

```bash
npm run test:e2e
```

If the terminal returns a green `PASS` result, the E2E test environment is functioning correctly.