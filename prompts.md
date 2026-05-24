# AI & Agents Interactions (`prompts.md`)

This file contains the core prompts used during development.

## 1. Database Configuration
> I am working on a NestJS project and I have a local PostgreSQL database running via Docker. 
> Please help me configure TypeORM in my `src/app.module.ts` file. 
> 
> Generate the `TypeOrmModule.forRoot()` configuration with the following connection details:
> - type: 'postgres'
> - host: 'localhost'
> - port: 5432
> - username: 'issueflow'
> - password: 'issueflow'
> - database: 'issueflow'
> - autoLoadEntities: true
> - synchronize: true
> 
> Please provide the updated `app.module.ts` code.

## 2. Environment Variables & Advanced TypeORM Configuration
> I am setting up TypeORM in my NestJS project and want to use environment variables with fallbacks, alongside a `.env` and `.env.example` file. 
> 
> Please provide the following:
> 1. The terminal command to install the NestJS config package (`@nestjs/config`).
> 2. The exact content for the `.env` and `.env.example` files containing the standard PostgreSQL connection details (host, port, username, password, database) set to 'localhost', 5432, and 'issueflow' for local development.
> 3. The updated `src/app.module.ts` code. It should import `ConfigModule.forRoot({ isGlobal: true })` and configure `TypeOrmModule.forRoot(...)`. Use `process.env` to read the variables, but include a fallback (e.g., `process.env.DB_USERNAME || 'issueflow'`) for every connection property so the app won't crash if the `.env` file is missing. Set `autoLoadEntities: true` and `synchronize: true`.

## 3. Users Module Implementation
> Implement the Users Module in this NestJS project using TypeORM, following the required API contract.
> 
> 1. User Entity (`src/users/user.entity.ts`):
>    - id: Auto-increment primary key.
>    - username: String, unique.
>    - email: String.
>    - fullName: String.
>    - password: String (will be used for authentication later).
>    - role: Enum with values 'ADMIN' or 'DEVELOPER'.
> 
> 2. Users Service (`src/users/users.service.ts`):
>    - Implement standard TypeORM Repository CRUD operations: findAll, findById, findByUsername, create, update, and delete.
> 
> 3. Users Controller (`src/users/users.controller.ts`):
>    - Map the endpoints exactly as defined in the contract:
>      - GET /users -> Get all users (returns 200 OK)
>      - GET /users/:userId -> Get user by ID (returns 200 OK)
>      - POST /users -> Create a user (accepts username, email, fullName, role in body, returns 200 OK)
>      - POST /users/update/:userId -> Update user details (accepts fullName and role in body, returns 200 OK)
>      - DELETE /users/:userId -> Delete a user (returns 200 OK)
> 
> Ensure the `UsersModule` and the `User` entity are registered correctly, and imported into `src/app.module.ts`. Use standard NestJS architecture.

## 4.refactor
    Refactor the current Users module to use Classes (DTOs) instead of Interfaces for request handling, and apply class-validator decorators. Create CreateUserDto with properties: username (required, string), email (required, is email), fullName (required, string), role (required, enum matching UserRole), and an optional password (string). Create UpdateUserDto with optional fullName (string) and optional role (enum matching UserRole). Update UsersService and UsersController to accept these DTOs instead of the old interfaces. Finally, to ensure the global validation pipe is active, update src/main.ts to include app.useGlobalPipes(new ValidationPipe({ whitelist: true })); making sure to import ValidationPipe from @nestjs/common

## 5. Swagger UI Setup
> Configure and enable Swagger in `src/main.ts` using `@nestjs/swagger`. 
> 
> 1. Create a `DocumentBuilder` with the following options:
>    - Title: "IssueFlow API"
>    - Description: "The IssueFlow TDP Home Assignment API documentation"
>    - Version: "1.0"
> 
> 2. Setup the Swagger UI:
>    - Mount the Swagger UI at the `/api` route using `SwaggerModule.setup()`.
> 
> Ensure all necessary modules (`DocumentBuilder`, `SwaggerModule`) are imported correctly from `@nestjs/swagger`.

## Auth
     1. Create a new `AuthModule` to handle JWT-based authentication. Please follow these exact steps:

1. Create `src/auth/dto/login.dto.ts` with `username` and `password` (use class-validator and Swagger decorators).
2. Create `src/auth/auth.service.ts`:
   - Inject `UsersService` and `JwtService`.
   - Create a `login` method that validates the user via `UsersService.findByUsername`.
   - Perform a plain-text password comparison (as requested for now). If invalid, throw `UnauthorizedException`.
   - If valid, generate a JWT payload containing `sub` (user id), `username`, and `role`.
   - The method must return the exact structure: `{ accessToken: string, tokenType: 'Bearer', expiresIn: 3600 }`.
3. Create `src/auth/auth.controller.ts`:
   - Add a `POST /auth/login` endpoint using `LoginDto`.
   - Document it with `@ApiTags('Auth')` and standard Swagger response decorators.
4. Create `src/auth/auth.module.ts`:
   - Import `UsersModule`.
   - Register `JwtModule` with a temporary secret (e.g., 'super-secret') and `signOptions: { expiresIn: '3600s' }`.
   - Provide the controller and service.
5. Register the `AuthModule` inside `app.module.ts`.

2.We successfully completed part 1 and the login route works perfectly! Let's implement part 2 to protect our routes and add the `/auth/me` endpoint. Please include clean English comments (`//`) at key points:

1. Create a JWT strategy in `src/auth/strategies/jwt.strategy.ts`:
   - Extend `PassportStrategy(Strategy)` from `@nestjs/passport` and `passport-jwt`.
   - Configure it to extract the JWT from the `Authorization` header as a Bearer token.
   - Use the same temporary secret key ('super-secret').
   - In the `validate(payload)` method, return an object containing `{ id: payload.sub, username: payload.username, role: payload.role }`.
2. Create a custom guard or register it in `src/auth/guards/jwt-auth.guard.ts` extending `AuthGuard('jwt')`.
3. Update `src/auth/auth.controller.ts`:
   - Add a `GET /auth/me` endpoint.
   - Protect it using `@UseGuards(JwtAuthGuard)`.
   - Document it in Swagger so it indicates it requires Bearer Authentication.
   - The endpoint should read the user profile attached to `req.user` and fetch the complete user data via `UsersService` (excluding the password).
4. Update `src/auth/auth.module.ts` to include `PassportModule` and register the `JwtStrategy` as a provider.

3.Let's implement the final part of the authentication chapter: the Logout functionality. Please include clean, informative comments in English (`//`):

1. Update `src/auth/auth.controller.ts`:
   - Add a `POST /auth/logout` endpoint.
   - Protect this endpoint using `@UseGuards(JwtAuthGuard)` because only a logged-in user with a valid token should be able to log out.
   - Document it in Swagger (`@ApiTags('Auth')` and appropriate Swagger response decorators).
   - The method should return a clean success message structure: `{ message: 'Logout successful' }`.


### Projects 
    1.We are starting Stage 2: Projects Module. Please create the `ProjectsModule` with TypeORM and JWT protection. Follow these exact steps and ensure you include clean, educational comments in English (`//`) at key logic points and complex architecture parts to make the code easy to follow:

1. Create `src/projects/entities/project.entity.ts`. It should have an `id` (PrimaryGeneratedColumn), `name`, `description`, and a `ManyToOne` relationship to the `User` entity (as `owner`). Add `@CreateDateColumn()`, `@UpdateDateColumn()`, and importantly, `@DeleteDateColumn()` to support soft deletes. Add comments explaining the relationship mapping and how soft delete works.
2. Create `src/projects/dto/create-project.dto.ts` and `update-project.dto.ts` using `class-validator` (IsString, IsNotEmpty, IsOptional) and Swagger decorators (`@ApiProperty`). `ownerId` should be required in CreateDto, but omitted from UpdateDto.
3. Create `src/projects/projects.service.ts` to handle standard CRUD. Inject the `Project` repository. Implement `create`, `findAll`, `findOne`, `update`, and use TypeORM's `softDelete` or `softRemove` for the `remove` method.
4. Create `src/projects/projects.controller.ts` with REST endpoints (GET, POST, PATCH, DELETE). Protect the entire controller with `@UseGuards(JwtAuthGuard)`. Add `@ApiBearerAuth()` and `@ApiTags('Projects')` for Swagger documentation.
5. Create `src/projects/projects.module.ts`, register the `Project` entity via `TypeOrmModule.forFeature([Project])`, and provide the controller and service.
6. Register `ProjectsModule` inside `app.module.ts`.

### Tickets 
    1.Generate the core `TicketsModule` for the NestJS application using TypeORM and PostgreSQL. This is Part 1 of the module creation. Do NOT implement CSV export/import yet.

Follow these strict architectural and business logic requirements:

1. **Ticket Entity (`ticket.entity.ts`)**:
   - `id`: PrimaryGeneratedColumn.
   - `title`, `description`: String columns.
   - `status`: Enum (`TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`), default is `TODO`.
   - `priority`: Enum (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), default is `LOW`.
   - `type`: Enum (`BUG`, `FEATURE`, `TECHNICAL`).
   - `dueDate`: Date column.
   - Relations: `project` (ManyToOne to Project entity, required), `assignee` (ManyToOne to User entity, optional).
   - Versioning: `version` column using TypeORM's `@VersionColumn()` for Optimistic Locking.
   - Audit columns: `createdAt`, `updatedAt`, `deletedAt` (for soft deletes).

2. **DTOs (`create-ticket.dto.ts` & `update-ticket.dto.ts`)**:
   - Use `class-validator` (@IsString, @IsEnum, @IsDate, etc.) and `class-transformer` (e.g., @Type(() => Date)).
   - `CreateTicketDto` should accept `projectId` (number, required) and `assigneeId` (number, optional).
   - `UpdateTicketDto` should extend `CreateTicketDto` using `PartialType`, BUT explicitly override and require the `version` field (`@IsInt()`, `@IsNotEmpty()`). This is mandatory for optimistic locking.

3. **Controller (`tickets.controller.ts`)**:
   - Apply the existing `JwtAuthGuard` globally to the controller.
   - Endpoints needed: 
     - `POST /tickets`
     - `GET /tickets` (Must filter by `projectId` using a query parameter: `?projectId=1`)
     - `GET /tickets/:ticketId`
     - `PATCH /tickets/:ticketId`
     - `DELETE /tickets/:ticketId` (Soft delete. Must return a meaningful JSON success object, not void, e.g., `{ success: true, message: '...' }`).

4. **Service (`tickets.service.ts`) - CRITICAL BUSINESS LOGIC**:
   - **isOverdue Calculation**: On all `GET` operations, dynamically map the returned ticket objects to include an `isOverdue` boolean property (true if `dueDate < now` AND `status !== DONE`). Do not save this property in the DB.
   - **DONE Lock**: In the `PATCH` method, if the current DB ticket status is `DONE`, throw a `BadRequestException` ('Cannot update a ticket that is DONE').
   - **Status Lifecycle**: Enforce that status can only move forward: `TODO` -> `IN_PROGRESS` -> `IN_REVIEW` -> `DONE`. If the incoming status attempts to move backwards, throw a `BadRequestException`.
   - **Optimistic Locking Conflict Resolution**: In the `PATCH` method, manually compare the `dto.version` against the `dbTicket.version`. If they do not match, do NOT attempt to save. Instead, throw a `ConflictException` (409) containing a custom JSON response that includes the latest ticket state from the DB (e.g., `{ message: 'Ticket updated by another user', latestTicket: dbTicket }`).

5. **Code Documentation**:
   - Add clear, concise English comments explaining the complex logic inside `tickets.service.ts` (specifically around the lifecycle enforcement, optimistic locking mechanism, and dynamic `isOverdue` calculation) to ensure the logic is highly readable and maintainable.

Write clean, production-ready TypeScript code and provide the implementation for the Entity, DTOs, Controller, Service, and Module.

2.I want to implement Part 2 (CSV Import/Export) using a clean, separated approach (the "half-half" helper approach) so that `tickets.service.ts` doesn't become bloated and remains highly testable.

Please perform the following steps:

1. **Create a Dedicated CSV Helper File** (e.g., `src/tickets/helpers/ticket-csv.helper.ts` or similar):
   - **Export logic**: Write a pure helper function that takes an array of enriched ticket objects and uses `csv-stringify` to return a clean CSV string.
   - **Import/Parsing logic**: Write a helper function that takes the uploaded file buffer, parses it using `csv-parse`, and runs structural validations row-by-row (checking for missing mandatory fields like title, status, priority, type, and verifying they match their respective enum types). 
   - This helper should NOT inject any repositories. It should return an object containing `{ validRows: EnrichedParsedRow[], validationErrors: string[] }`.

2. **Update `tickets.service.ts`**:
   - Keep it clean by invoking the helper functions.
   - **For Export (`exportTicketsToCsv`)**: Fetch the data filtering out soft-deleted items, compute `isOverdue` using our standard logic (`isOverdue = (dueDate < now) && (status !== 'DONE')`), and pass it to the export helper.
   - **For Import (`importTicketsFromCsv`)**: Call the parsing helper first. Then, using the repository already available in the service, perform database-level checks if necessary and execute a bulk save for all `validRows`. Return the final aggregated summary response.

3. **Update `tickets.controller.ts`**:
   - Add `GET /tickets/export` and `POST /tickets/import`.
   - Ensure the import endpoint uses NestJS `FileInterceptor` and is fully decorated with Swagger (`@ApiConsumes('multipart/form-data')`) so that a file upload button appears in the Swagger UI.

Let's generate the code across these files.

3.
I need to perfectly align the CSV import logic with the strict requirements of my assignment README. The exact requirement for the import endpoint is:
`multipart/form-data: file (CSV), projectId (form field)`

This means the `projectId` must be received as a separate form data field in the Controller, and it should NOT be expected as a column inside the CSV file itself.

Please update `src/tickets/tickets.controller.ts` and `src/tickets/helpers/ticket-csv.helper.ts` to implement this exact architecture:

1. Controller: Update the `importTicketsFromCsv` method to extract `projectId` (parsed as a number) from the multipart form body (e.g., using `@Body('projectId')`), alongside the uploaded file. Pass this `projectId` to the helper function.
2. Helper: Update the CSV parsing logic so it accepts the `projectId` as an argument from the controller. It should no longer expect or read a `projectId` column from the CSV rows. Instead, it must automatically inject the provided `projectId` into every valid ticket it parses from the file.
3. Swagger Documentation: Update the `@ApiBody` and `@ApiConsumes('multipart/form-data')` decorators to explicitly show both `file` (binary) and `projectId` (number) as required form fields in the Swagger UI. Add a clear note in the `@ApiOperation` stating that the uploaded CSV should NOT contain `projectId`, `id`, or `isOverdue` columns.

Keep the row-by-row error collecting and validation logic fully intact!

### Extended Features 
1.Implement the missing endpoints and service methods for the "Soft Delete & Restore" feature based on the project README contract.

Enforce the ADMIN-only constraint by checking `req.user.role !== 'ADMIN'` directly inside the controllers. If the user is not an admin, throw a `ForbiddenException('Only admins can access deleted records')`. 

Add clear inline English comments explaining the TypeORM soft-delete filtering and restoration logic in complex areas.

Make the following exact changes:

1. Update `src/projects/projects.controller.ts` & `src/projects/projects.service.ts`:
   - GET `/projects/deleted` -> Protected by `JwtAuthGuard`. Checks if user is ADMIN. Returns only soft-deleted projects.
   - POST `/projects/:projectId/restore` -> Protected by `JwtAuthGuard`. Checks if user is ADMIN. Restores the project using TypeORM. Must explicitly use `@HttpCode(200)`.

2. Update `src/tickets/tickets.controller.ts` & `src/tickets/tickets.service.ts`:
   - GET `/tickets/deleted` -> Protected by `JwtAuthGuard`. Accepts `projectId` as a query parameter. Checks if user is ADMIN. Returns only soft-deleted tickets filtered by that `projectId`.
   - POST `/tickets/:ticketId/restore` -> Protected by `JwtAuthGuard`. Checks if user is ADMIN. Restores the ticket using TypeORM. Must explicitly use `@HttpCode(200)`.

Technical specifics for implementation:
- To fetch only deleted records, use TypeORM's `withDeleted: true` query option combined with an `IsNotNull()` find operator on the deletion timestamp column.
- To restore records, use TypeORM's built-in `.restore(id)` repository method.
- Ensure all existing standard GET methods remain untouched so that soft-deleted items stay hidden from regular users.

2.Implement Feature 3.8: Auto Assignment to Users by Workload. Make the exact following changes:

1. In `src/tickets/tickets.service.ts` -> update the existing `create` method:
If `input.assigneeId` is absent or null, execute auto-assignment:
- Find all users linked to `input.projectId` who have `role: 'DEVELOPER'`.
- Calculate the workload for each developer: count tickets in this project assigned to them where `status != 'DONE'` and `deletedAt IS NULL`.
- Select the developer with the lowest workload count.
- Tie-breaker: If counts are equal, pick the user with the lowest `id` (oldest registrant).
- If a developer is found, set them as the `assignee`. If no developers exist in the project, leave `assignee` as `null` without throwing an error.
- Add an inline comment: `// TODO: Record in Audit Log (actor=SYSTEM, action=AUTO_ASSIGN)` (we will implement the actual audit log later).

2. In `src/projects/projects.controller.ts` & `src/projects/projects.service.ts`:
- Add endpoint `GET /projects/:projectId/workload`.
- Protect it with `JwtAuthGuard`.
- The service method should calculate the workload for all users in the project and return an array of objects matching this exact structure: `{ userId, username, openTicketCount }`.
- Sort the resulting array by `openTicketCount` ascending.

Include inline English comments explaining the workload calculation and tie-breaker sorting. Do not break the existing TypeORM implementations.

3.Create the Audit Logs module matching the README specifications.
Add inline comments in English to explain complex structural logic, specifically around the dynamic filtering. Do not generate test files.

1. Create `src/audit-logs/entities/audit-log.entity.ts`:
Define an `AuditLog` entity with columns:
- `id`: auto-increment primary key.
- `action`: string.
- `entityType`: string.
- `entityId`: number.
- `performedBy`: number (nullable).
- `actor`: string.
- `timestamp`: Date (use TypeORM CreateDateColumn for automatic, immutable timestamping).

2. Create `src/audit-logs/audit-logs.service.ts`:
- Implement `logAction(action: string, entityType: string, entityId: number, performedBy: number | null, actor: string): Promise<AuditLog>`. This method must only insert data to enforce an append-only architecture.
- Implement `getLogs(filters: { entityType?: string, entityId?: number, action?: string, actor?: string }): Promise<AuditLog[]>`. Add logic to dynamically build the TypeORM `where` clause based only on the provided filter parameters.

3. Create `src/audit-logs/audit-logs.controller.ts`:
- Implement `GET /audit-logs`.
- Protect the endpoint with `JwtAuthGuard`.
- Use `@Query()` to accept optional query parameters: `entityType`, `entityId`, `action`, `actor`. Pass these directly to the `getLogs` service method.

4. Create `src/audit-logs/audit-logs.module.ts`:
- Configure `TypeOrmModule.forFeature([AuditLog])`.
- Register the controller and the service.
- Export `AuditLogsService` so it can be injected into other feature modules.

Generate the files inside a new `src/audit-logs` folder now.
