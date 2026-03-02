export interface RepositoryRef {
  owner: string;
  name: string;
}

export interface ProfileSettings {
  displayName: string | null;
  timezone: string | null;
}

export interface ReviewPreferencesSettings {
  depth: 'quick' | 'standard' | 'deep';
  focusAreas: Array<'bugs' | 'security' | 'quality' | 'performance' | 'maintainability'>;
  outputLength: 'short' | 'medium' | 'long';
  autoLoadLatestReview: boolean;
  autoGenerateWhenMissing: boolean;
}

export interface RepositoryPreferencesSettings {
  defaultRepository: RepositoryRef | null;
  excludedRepositories: RepositoryRef[];
}

export interface UiPreferencesSettings {
  showCooldownHints: boolean;
}

export interface UserSettingsDocument {
  schemaVersion: number;
  profile: ProfileSettings;
  reviewPreferences: ReviewPreferencesSettings;
  repositoryPreferences: RepositoryPreferencesSettings;
  uiPreferences: UiPreferencesSettings;
  updatedAt?: string | null;
}

export interface UserSettingsResponse {
  settings: UserSettingsDocument;
}

export interface UpdateUserSettingsRequest {
  settings: UserSettingsDocument;
}
