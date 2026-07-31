# Real Estate Portal

Monorepo scaffold for the 3D Interactive Real Estate Portal.

Planned apps:
- `apps/api` - backend API
- `apps/web` - frontend web app
- `packages/shared` - shared types and utilities

## Next Steps

1. Start PostgreSQL locally or with Docker.
2. Copy `.env.example` to `.env` and update `DATABASE_URL`.
3. Apply the initial migration:
   - `npm run prisma:deploy --workspace apps/api`
4. Seed the base roles and permissions:
   - `npm run prisma:seed --workspace apps/api`
5. Start the API:
   - `npm run dev:api`
6. Start the web app:
   - `npm run dev:web`

## Documentation

- [User Manual](./docs/user-manual.md)
- [System Manual](./docs/system-manual.md)
- [ERD](./docs/erd.md)
