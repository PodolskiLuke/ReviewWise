
# ReviewWise

## Overview
A web app that integrates with GitHub/GitLab to provide AI-powered code reviews, suggest improvements, and flag bugs/security issues, tailored to team coding standards. Project name: ReviewWise.

## Features Roadmap

### MVP

### Next Steps

### Advanced

## Tech Stack
- Frontend: Angular
5. Register a new OAuth app on GitHub:
	- Homepage URL: `http://localhost:5010/`
	- Authorization callback URL: `http://localhost:5010/signin-github`
	- Application description: AI-Assisted Code Review Tool for GitHub/GitLab pull requests. Uses AI to suggest improvements and flag issues, tailored to team coding standards.
6. Register a new OAuth app on GitLab:
	- Homepage URL: `http://localhost:5010/`
	- Redirect URI: `http://localhost:5010/signin-gitlab`
	- Application description: AI-Assisted Code Review Tool for GitHub/GitLab pull requests. Uses AI to suggest improvements and flag issues, tailored to team coding standards.
7. Add your GitHub and GitLab ClientId and ClientSecret to `backend/ReviewWise.Api/appsettings.json` under `Authentication:GitHub` and `Authentication:GitLab`.
8. Run `dotnet run` in `backend/ReviewWise.Api` to start the API server (it will run on http://localhost:5010 by default).
9. Visit `http://localhost:5010/login` to authenticate with GitHub, or `/login-gitlab` for GitLab. Use `/logout` to sign out.
Open to contributions! See CONTRIBUTING.md for guidelines.

 Ensure the ports and callback URLs in your OAuth app settings match the backend server (default: http://localhost:5010).
- Database: SQLite (dev), upgradeable
