לחלוטין, הנה כל התוכן של הקובץ כגוש קוד אחד רציף. אתה יכול פשוט ללחוץ על כפתור ההעתקה (Copy) בפינה של תיבת הקוד הבאה, לפתוח קובץ חדש בשם `run.md` בשורש הפרויקט, ולהדביק אותו בפנים בבת אחת:

```markdown
# Setup and Execution Guide

This document outlines the exact steps required to install dependencies, spin up the database, run the local server for Swagger, and execute the automated test suites.

---

## 1. Install Dependencies
Before starting, ensure all required npm packages are installed successfully:
```bash
npm install

```

## 2. Start the Database

The project uses PostgreSQL for data persistence. Spin up the database container in detached mode using Docker Compose:

```bash
docker compose up -d

```

*Note: Make sure Docker Desktop is open and running on your machine.*

## 3. Run the Application (Local Server & Swagger)

To launch the application in development mode with hot-reload enabled (perfect for manual testing and accessing the Swagger UI):

```bash
npm run start:dev

```

Once the server starts, you can access the local API and interactive Swagger documentation at:

**`http://localhost:3000`**

---

## 4. Run the Tests

To verify system functionality, API integrity, and the business logic of our locking mechanisms, execute the automated test suites:

### Unit Tests:

```bash
npm run test

```

### End-to-End (E2E) Tests:

```bash
npm run test:e2e

```

---

## 📝 Technical Notes & Architectural Insights

### 1. API Response Status (`201 Created` vs `200 OK`)

* Following standard **NestJS architecture** and REST best practices, all resource creation endpoints (`POST`) return a `201 Created` status code upon successful execution.
* This includes the `/auth/login` endpoint, which implicitly uses NestJS's default `@Post()` decorators.
* All automated E2E test blocks (including the Optimistic Locking test suites) have been fully synchronized and verified to expect and pass with these standard status codes.

### 2. Robust Date Parsing (`isOverdue` Evaluation)

* Incoming data structures from HTTP clients transfer dates as ISO-8601 string primitives.
* The system's internal core validation (`withIsOverdue` engine inside `TicketsService`) has been fortified with programmatic instantiation (`new Date(ticket.dueDate)`) to naturally ensure seamless runtime evaluation for both pure database models and incoming transfer payloads.

```
During development, some IDEs (like VS Code) may show a linter warning (dotted underline) on the supertest import or request usage. This is a known issue with TypeScript/Jest type definitions in this environment. The tests are fully functional and execute correctly via npm run test:e2e.
```