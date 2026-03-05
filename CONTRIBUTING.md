# Contributing Guidelines

## Branching Strategy (GitFlow)

| Branch | Purpose | Cut from | Merges into |
|---|---|---|---|
| `main` | Production | — | — |
| `develop` | Integration | `main` | `main` via release |
| `feature/NAME` | New features | `develop` | `develop` |
| `bugfix/NAME` | Bug fixes | `develop` | `develop` |
| `release/vX.Y.Z` | Release prep | `develop` | `main` + `develop` |
| `hotfix/NAME` | Critical prod fixes | `main` | `main` + `develop` |

```bash
# Start a feature
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name

# Finish and merge
git checkout develop
git merge --no-ff feature/your-feature-name
git branch -d feature/your-feature-name
```

## Commit Message Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add tablespace alert email
fix: correct AES-256 IV reuse bug
docs: update SETUP.md WinRM instructions
test: add integration tests for locks route
refactor: simplify credential controller
chore: update dependencies
```

## Pre-PR Checklist

- [ ] All tests pass: `npm test` in `backend/`
- [ ] No ESLint errors: `npm run lint`
- [ ] New feature has unit + integration tests
- [ ] No credentials in code, logs, or comments
- [ ] All new routes use express-validator
- [ ] API documentation updated in `docs/API.md`

## Security Checklist for PRs

- [ ] No hardcoded secrets or API keys
- [ ] No plaintext credential logging
- [ ] No raw SQL string concatenation (use Knex)
- [ ] No credentials returned in API responses
- [ ] Input validation on all new endpoints
- [ ] New tables/columns follow encryption rules

## Code Style

- 2-space indentation
- Single quotes for strings
- `const` over `let` where possible, never `var`
- Descriptive variable names — no single-letter variables outside loops
- Error messages are user-friendly, not stack traces

## Running Tests

```bash
# Backend unit + integration tests
cd backend && npm test

# Watch mode during development
cd backend && npm run test:watch

# E2E tests (requires both servers running)
npm run test:e2e
```

## Reporting Bugs

Open a GitHub Issue with:
1. Steps to reproduce
2. Expected vs actual behavior
3. Error messages / logs (sanitize any credentials first)
4. Environment (OS, Node version, SAP release)

**Security vulnerabilities** — do not open a public issue. See [SECURITY.md](SECURITY.md).
