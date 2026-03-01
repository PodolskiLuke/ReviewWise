
# ReviewWise

## Overview
ReviewWise is a full-stack app that connects to GitHub/GitLab, fetches repository and pull request changes, and generates AI-assisted code reviews.

## Current Workflow
1. User lands on login screen.
2. User signs in with GitHub/GitLab.
3. App routes authenticated users to the repositories page.
4. User can search/select repositories and trigger PR review flows.

## Tech Stack
- Frontend: Angular 21 (standalone components, Karma/Jasmine tests)
- Backend: ASP.NET Core + OAuth (GitHub/GitLab)
- Database: SQLite (development)

## Project Structure
- Frontend app (Angular): repository root (`src/`, `package.json`)
- Backend API: `backend/ReviewWise.Api`

## Local Setup
### 1) Prerequisites
- Node.js + npm
- .NET SDK

### 2) Configure OAuth apps
#### GitHub OAuth app
- Homepage URL: `http://localhost:5010/`
- Authorization callback URL: `http://localhost:5010/signin-github`

#### GitLab OAuth app (optional)
- Homepage URL: `http://localhost:5010/`
- Redirect URI: `http://localhost:5010/signin-gitlab`

### 3) Configure backend secrets
Do not commit real secrets to source control. Use user secrets for local development:

```bash
cd backend/ReviewWise.Api
dotnet user-secrets init
dotnet user-secrets set "Authentication:GitHub:ClientId" "<YOUR_GITHUB_CLIENT_ID>"
dotnet user-secrets set "Authentication:GitHub:ClientSecret" "<YOUR_GITHUB_CLIENT_SECRET>"
dotnet user-secrets set "Authentication:GitLab:ClientId" "<YOUR_GITLAB_CLIENT_ID>"
dotnet user-secrets set "Authentication:GitLab:ClientSecret" "<YOUR_GITLAB_CLIENT_SECRET>"
dotnet user-secrets set "OpenAI:ApiKey" "<YOUR_OPENAI_API_KEY>"
```

### 4) Run backend
```bash
cd backend/ReviewWise.Api
dotnet clean
dotnet build
dotnet run
```

Backend default URL: `http://localhost:5010`

### 5) Run frontend
```bash
cd <repo-root>
npm install
npm start
```

Frontend default URL: `http://localhost:4200`

### 6) One-command dev start/stop (Windows)
From repo root:

```bash
npm run dev:start
```

This starts backend and frontend in separate terminals and cleans stale processes/ports.

To stop both:

```bash
npm run dev:stop
```

## Testing
From repo root:

```bash
npm test
```

Visual runner (Chrome watch mode):

```bash
npm run test:watch
```

## NgRx DevTools walkthrough (repositories -> PR -> review)
The app now centralizes repository, pull request, and review async flows in NgRx.

1. Install/open Redux DevTools in your browser.
2. Run app with `npm run dev:start`, login, and navigate to repositories.
3. In DevTools actions, verify this sequence:
	- `[Review Data] Load Repositories`
	- `[Review Data] Load Repositories Success` (or `Failure`)
	- `[Review Data] Select Repository`
	- `[Review Data] Load Pull Requests`
	- `[Review Data] Load Pull Requests Success` (or `Failure`)
	- `[Review Data] Select Pull Request`
	- `[Review Data] Load Latest Review` -> `Success`/`Failure`
	- If latest review is missing (`404`): `[Review Data] Generate Review` runs automatically
	- `[Review Data] Generate Review` -> `Success`/`Failure`
4. In state tab (`reviewData`), watch these keys:
	- `repositoriesLoading`, `repositoriesError`
	- `pullRequestsLoading`, `pullRequestsError`, `selectedPullRequest`
	- `reviewLoading`, `reviewError`, `reviewText`, `reviewMeta`, `reviewStatusMessage`

If UI seems stuck, DevTools will show exactly which action did not transition to a terminal `Success`/`Failure` state.

## Notes
- Backend returns `401/403` for unauthorized `/api/*` requests (no OAuth redirect for XHR).
- Ensure OAuth callback URLs exactly match the configured backend endpoints.
- Review generation is rate-limited per user/repository/PR (default cooldown: 60 seconds) and may return `429` with retry guidance.

## Common failures (quick fixes)

### 1) Frontend fails with `Port 4200 is already in use`
- Quick fix: run `npm run dev:stop`, then `npm run dev:start`.
- Manual fallback: stop process listening on 4200 and run `npm start` again.

### 2) Backend `dotnet run` exits with code `1`
- Most common cause: command run from wrong directory.
- Use: `cd backend/ReviewWise.Api` then `dotnet run`.
- If binary lock errors appear, stop existing `ReviewWise.Api` process(es) and retry.

### 3) API calls return `401` in terminal checks
- This is expected for `/api/*` without authenticated browser session/cookies.
- In browser flow: login first, then retry repository/PR/review actions.

### 4) App behaves like old code after changes
- Clear cache and restart:
	- stop dev processes: `npm run dev:stop`
	- remove Angular cache if needed: delete `.angular/cache`
	- start again: `npm run dev:start`

### 5) PR/review flow looks stuck
- Open Redux DevTools and inspect `reviewData` action sequence.
- Confirm each load action reaches terminal state (`Success` or `Failure`).
- Use the NgRx walkthrough above to locate the exact missing transition.

### 6) Review generation returns `429 Too Many Requests`
- This is expected if the same user requests generation repeatedly for the same repository/PR within the cooldown window.
- Wait for the `retryAfterSeconds` value from the API response, then retry.
