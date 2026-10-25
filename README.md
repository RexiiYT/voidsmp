# voidsmp

Arabic Lifesteal Minecraft server and its administration dashboard.

## Web administration dashboard

This repository now contains the `voidsmp` administration dashboard. It includes secure owner, manager, admin, and tester roles; image-based moderation review; task-specific points; Discord ticket analysis; tester bug reports; and role-based visibility.

### Local development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

The full application uses the server runtime, managed database, storage, and runtime secrets. Configure `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `APP_SESSION_SECRET`, and the database/storage values in the deployment environment; never commit them to GitHub.

### Production

The included `Dockerfile` builds and runs the full-stack application. A deployment service that supports Node.js/Docker, environment secrets, persistent database access, and object storage should be connected to this repository's `main` branch.

GitHub Pages is not used for the live dashboard because it serves static files only and cannot run the dashboard's authentication, API routes, AI analysis, or database-backed bug reports. GitHub Actions validates the application build on every push and pull request; the running website must use a backend-capable deployment target connected to this repository.

### Minecraft server

The original project identity is preserved: `voidsmp` is an Arabic Lifesteal Minecraft server.
