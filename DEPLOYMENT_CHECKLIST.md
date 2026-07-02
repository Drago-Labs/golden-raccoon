# Deployment Checklist

Run these before deploying:

```bash
npm run deploy:check
npm run build --prefix frontend
```

After deployment, verify:

```bash
SMOKE_BASE_URL=https://your-domain.example npm run smoke
```

Required source modules must be committed, especially:

- `frontend/src/server/cache/strategy.ts`
- `frontend/src/server/env/validation.ts`
- `frontend/src/server/security/policy.ts`
- `frontend/src/server/security/rateLimit.ts`
- `frontend/src/server/storage/index.ts`

If Vercel reports `module-not-found`, first run:

```bash
npm run deploy:check
git status --short --untracked-files=all
```
