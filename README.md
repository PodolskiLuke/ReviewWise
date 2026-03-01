
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

## Testing
From repo root:

```bash
npm test
```

Visual runner (Chrome watch mode):

```bash
npm run test:watch
```

## Notes
- Backend returns `401/403` for unauthorized `/api/*` requests (no OAuth redirect for XHR).
- Ensure OAuth callback URLs exactly match the configured backend endpoints.
