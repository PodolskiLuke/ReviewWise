# User Settings Schema and API Contract

This document defines the initial (MVP) authenticated user settings model for ReviewWise.

## Goals

- Store settings per authenticated user on the backend.
- Provide a stable API contract for frontend settings forms.
- Keep MVP small while allowing future extension.

## Versioning

- Include `schemaVersion` in persisted settings.
- Current version: `1`.

## Data Model (v1)

```json
{
  "schemaVersion": 1,
  "profile": {
    "displayName": "Luke",
    "timezone": "Europe/London"
  },
  "reviewPreferences": {
    "depth": "standard",
    "focusAreas": ["bugs", "security", "quality"],
    "outputLength": "medium",
    "autoLoadLatestReview": true,
    "autoGenerateWhenMissing": true
  },
  "repositoryPreferences": {
    "defaultRepository": {
      "owner": "PodolskiLuke",
      "name": "ReviewWise"
    },
    "excludedRepositories": []
  },
  "uiPreferences": {
    "showCooldownHints": true
  },
  "updatedAt": "2026-03-02T21:00:00Z"
}
```

## Enumerations

### `reviewPreferences.depth`
- `quick`
- `standard`
- `deep`

### `reviewPreferences.focusAreas[]`
- `bugs`
- `security`
- `quality`
- `performance`
- `maintainability`

### `reviewPreferences.outputLength`
- `short`
- `medium`
- `long`

## Validation Rules

- `displayName`: optional, trimmed, max 80 chars.
- `timezone`: optional, IANA TZ string (e.g. `Europe/London`), max 64 chars.
- `focusAreas`: unique values, max 5 items.
- `excludedRepositories`: unique by `owner/name`, max 100 entries.
- `defaultRepository` must not be present in `excludedRepositories`.

## API Endpoints

Base: `/api/user-settings`

### `GET /api/user-settings`
Returns effective settings for the authenticated user.

- **200 OK**
```json
{
  "settings": {
    "schemaVersion": 1,
    "profile": { "displayName": "Luke", "timezone": "Europe/London" },
    "reviewPreferences": {
      "depth": "standard",
      "focusAreas": ["bugs", "security", "quality"],
      "outputLength": "medium",
      "autoLoadLatestReview": true,
      "autoGenerateWhenMissing": true
    },
    "repositoryPreferences": {
      "defaultRepository": { "owner": "PodolskiLuke", "name": "ReviewWise" },
      "excludedRepositories": []
    },
    "uiPreferences": { "showCooldownHints": true },
    "updatedAt": "2026-03-02T21:00:00Z"
  }
}
```
- **401 Unauthorized** if not authenticated.

### `PUT /api/user-settings`
Replaces settings (full-document update).

Request body:
```json
{
  "settings": {
    "schemaVersion": 1,
    "profile": { "displayName": "Luke", "timezone": "Europe/London" },
    "reviewPreferences": {
      "depth": "standard",
      "focusAreas": ["bugs", "security", "quality"],
      "outputLength": "medium",
      "autoLoadLatestReview": true,
      "autoGenerateWhenMissing": true
    },
    "repositoryPreferences": {
      "defaultRepository": { "owner": "PodolskiLuke", "name": "ReviewWise" },
      "excludedRepositories": []
    },
    "uiPreferences": { "showCooldownHints": true }
  }
}
```

Responses:
- **200 OK** with normalized settings payload.
- **400 Bad Request** with validation errors.
- **401 Unauthorized** if not authenticated.

### Optional future endpoint: `PATCH /api/user-settings`
For partial updates once needed; not required for MVP.

## Error Shape

Use a consistent validation error payload:

```json
{
  "message": "Validation failed.",
  "errors": {
    "reviewPreferences.focusAreas": ["Contains invalid value: xyz"],
    "repositoryPreferences.defaultRepository": ["Cannot reference an excluded repository."]
  }
}
```

## Backend Persistence Recommendation

For MVP simplicity:
- Table: `UserSettings`
  - `UserId` (PK/FK to users)
  - `SchemaVersion` (int)
  - `SettingsJson` (text/json)
  - `UpdatedAtUtc` (datetime)

Alternative (future): normalize selected fields if query needs grow.

## Frontend Form Shape (Angular)

Recommended reactive form groups:

- `profile`
  - `displayName`
  - `timezone`
- `reviewPreferences`
  - `depth`
  - `focusAreas`
  - `outputLength`
  - `autoLoadLatestReview`
  - `autoGenerateWhenMissing`
- `repositoryPreferences`
  - `defaultRepository.owner`
  - `defaultRepository.name`
  - `excludedRepositories[]`
- `uiPreferences`
  - `showCooldownHints`

## Defaults (first login)

If no row exists, server returns defaults:

```json
{
  "schemaVersion": 1,
  "profile": { "displayName": null, "timezone": null },
  "reviewPreferences": {
    "depth": "standard",
    "focusAreas": ["bugs", "security", "quality"],
    "outputLength": "medium",
    "autoLoadLatestReview": true,
    "autoGenerateWhenMissing": true
  },
  "repositoryPreferences": {
    "defaultRepository": null,
    "excludedRepositories": []
  },
  "uiPreferences": { "showCooldownHints": true }
}
```

## Implementation Order

1. Add backend model + persistence (`UserSettings` table).
2. Add `GET /api/user-settings` and `PUT /api/user-settings` endpoints.
3. Add frontend service methods in `reviewwise-api.service.ts`.
4. Add Settings route/page and reactive form.
5. Add unit tests (backend validation + frontend form mapping).
6. Add one E2E smoke path for updating and persisting settings.
