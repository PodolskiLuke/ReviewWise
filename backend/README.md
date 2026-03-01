# ReviewWise Backend (ASP.NET Core)

## Overview
This is the backend API for ReviewWise. It handles authentication, repository integration, pull request fetching, AI review processing, and serves the frontend.

## Tech Stack
- ASP.NET Core (C#)
- REST API
- SQLite (dev, upgradeable)
- Integration with GitHub/GitLab APIs
- AI: OpenAI API or open-source models

## Setup
1. Install [.NET SDK](https://dotnet.microsoft.com/download)
2. Clone the repo and navigate to `/backend/ReviewWise.Api`
3. Run `dotnet restore` to install dependencies
4. (First time only) Run the following to set up the SQLite database:
	```
	dotnet tool install --global dotnet-ef
	dotnet ef database update
	```
5. Register a new OAuth app on GitHub:
	- Homepage URL: `http://localhost:5010/`
	- Authorization callback URL: `http://localhost:5010/signin-github`
6. Register a new OAuth app on GitLab:
	- Homepage URL: `http://localhost:5010/`
	- Redirect URI: `http://localhost:5010/signin-gitlab`
7. Configure secrets (recommended: user-secrets) rather than committing credentials in `appsettings.json`:
	```
	dotnet user-secrets init
	dotnet user-secrets set "Authentication:GitHub:ClientId" "<YOUR_GITHUB_CLIENT_ID>"
	dotnet user-secrets set "Authentication:GitHub:ClientSecret" "<YOUR_GITHUB_CLIENT_SECRET>"
	dotnet user-secrets set "Authentication:GitLab:ClientId" "<YOUR_GITLAB_CLIENT_ID>"
	dotnet user-secrets set "Authentication:GitLab:ClientSecret" "<YOUR_GITLAB_CLIENT_SECRET>"
	dotnet user-secrets set "OpenAI:ApiKey" "<YOUR_OPENAI_API_KEY>"
	```
8. Run the API:
	```
	dotnet clean
	dotnet build
	dotnet run
	```
9. Login endpoints:
	- GitHub: `http://localhost:5010/login`
	- GitLab: `http://localhost:5010/login-gitlab`
	- Logout: `http://localhost:5010/logout`

## Configuration
- API requests from frontend are allowed for `http://localhost:4200` (CORS with credentials enabled).
- Unauthorized `/api/*` requests return `401/403` (they do not redirect to OAuth provider).
- Ensure OAuth callback URLs exactly match backend settings.

## Development
- Use `dotnet watch run` for hot reload during development.
- OpenAPI docs available in development at `/openapi/v1.json`.

## Roadmap
- [x] User authentication (OAuth)
- [x] Repo integration
- [x] PR fetching
- [x] AI review endpoint
- [ ] Webhook support

## License
MIT
