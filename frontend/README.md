# ReviewWise Frontend (Angular)

## Overview
This is the Angular frontend for ReviewWise. It provides OAuth login UI, authenticated routing, repository search/listing, and integration with backend review endpoints.

## Tech Stack
- Angular 21
- SCSS
- Karma + Jasmine

## Setup
1. Install [Node.js](https://nodejs.org/)
2. From the repository root, run `npm install`
3. Start dev server with `npm start`

> Note: The frontend project is configured at the repository root (`package.json`, `src/`) rather than inside the `/frontend` folder.

## Scripts
- `npm start` — run Angular dev server (with proxy config)
- `npm test` — run tests headless (`ChromeHeadless`, no watch)
- `npm run test:watch` — run visual test runner in Chrome watch mode

## Development
- Backend API base URL is configured in `src/environments/environment.ts`
- Default backend target: `http://localhost:5010`
- Login screen is shown first; authenticated users are routed to `/repositories`

## Roadmap
- [x] Auth UI (OAuth)
- [x] Repository list + search
- [ ] Pull request list/details UI
- [ ] Review result details UI
- [ ] Settings page

## License
MIT
