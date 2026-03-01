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
	- Application description: AI-Assisted Code Review Tool for GitHub/GitLab pull requests. Uses AI to suggest improvements and flag issues, tailored to team coding standards.
6. Register a new OAuth app on GitLab:
	- Homepage URL: `http://localhost:5010/`
	- Redirect URI: `http://localhost:5010/signin-gitlab`
	- Application description: AI-Assisted Code Review Tool for GitHub/GitLab pull requests. Uses AI to suggest improvements and flag issues, tailored to team coding standards.
7. Add your GitHub and GitLab ClientId and ClientSecret to `appsettings.json` under `Authentication:GitHub` and `Authentication:GitLab`.
8. Run `dotnet run` to start the API server (it will run on http://localhost:5010 by default).
9. Visit `http://localhost:5010/login` to authenticate with GitHub, or `/login-gitlab` for GitLab. Use `/logout` to sign out.

## Configuration
- Set up environment variables for API keys and DB connection in `appsettings.json` or user secrets.
- For GitHub/GitLab integration, register your app and set client IDs/secrets.
- Ensure the ports and callback URLs in your OAuth app settings match the backend server (default: http://localhost:5010).

## Development
- Use `dotnet watch run` for hot reload during development.
- API docs available at `/swagger` if enabled.

## Roadmap
- [ ] User authentication (OAuth)
- [ ] Repo integration
- [ ] PR fetching
- [ ] AI review endpoint
- [ ] Webhook support

## License
MIT
