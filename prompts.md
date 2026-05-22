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
