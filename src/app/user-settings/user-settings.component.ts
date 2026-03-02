import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ReviewWiseApiService } from '../services/reviewwise-api.service';
import { UserSettingsDocument } from '../models/user-settings.models';

@Component({
  selector: 'app-user-settings',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './user-settings.component.html',
  styleUrl: './user-settings.component.scss'
})
export class UserSettingsComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly api = inject(ReviewWiseApiService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  readonly focusAreaOptions = ['bugs', 'security', 'quality', 'performance', 'maintainability'] as const;

  loading = true;
  saving = false;
  loadError: string | null = null;
  saveError: string | null = null;
  saveSuccess: string | null = null;

  readonly form = this.formBuilder.group({
    displayName: [''],
    timezone: [''],
    depth: ['standard'],
    outputLength: ['medium'],
    autoLoadLatestReview: [true],
    autoGenerateWhenMissing: [true],
    showCooldownHints: [true],
    defaultRepositoryOwner: [''],
    defaultRepositoryName: [''],
    excludedRepositoriesText: ['']
  });

  private focusAreas = ['bugs', 'security', 'quality'];
  private schemaVersion = 1;

  ngOnInit(): void {
    this.loadSettings();
  }

  isFocusAreaChecked(area: string): boolean {
    return this.focusAreas.includes(area);
  }

  onFocusAreaToggle(area: string, checked: boolean): void {
    if (checked) {
      if (!this.focusAreas.includes(area)) {
        this.focusAreas = [...this.focusAreas, area];
      }
      return;
    }

    this.focusAreas = this.focusAreas.filter(existing => existing !== area);
  }

  save(): void {
    if (this.saving) {
      return;
    }

    this.saving = true;
    this.saveError = null;
    this.saveSuccess = null;

    const raw = this.form.getRawValue();
    const defaultRepository = raw.defaultRepositoryOwner?.trim() && raw.defaultRepositoryName?.trim()
      ? {
          owner: raw.defaultRepositoryOwner.trim(),
          name: raw.defaultRepositoryName.trim()
        }
      : null;

    const settings: UserSettingsDocument = {
      schemaVersion: this.schemaVersion,
      profile: {
        displayName: this.toNullable(raw.displayName),
        timezone: this.toNullable(raw.timezone)
      },
      reviewPreferences: {
        depth: (raw.depth ?? 'standard') as 'quick' | 'standard' | 'deep',
        focusAreas: this.normalizeFocusAreas(),
        outputLength: (raw.outputLength ?? 'medium') as 'short' | 'medium' | 'long',
        autoLoadLatestReview: !!raw.autoLoadLatestReview,
        autoGenerateWhenMissing: !!raw.autoGenerateWhenMissing
      },
      repositoryPreferences: {
        defaultRepository,
        excludedRepositories: this.parseExcludedRepositories(raw.excludedRepositoriesText ?? '')
      },
      uiPreferences: {
        showCooldownHints: !!raw.showCooldownHints
      }
    };

    this.api.updateUserSettings(settings).subscribe({
      next: (response) => {
        this.saving = false;
        this.saveSuccess = 'Settings saved.';
        this.applySettings(response.settings);
        this.changeDetectorRef.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.saveError = 'Failed to save settings.';
        this.changeDetectorRef.markForCheck();
      }
    });
  }

  private loadSettings(): void {
    this.loading = true;
    this.loadError = null;

    this.api.getUserSettings().subscribe({
      next: (response) => {
        this.loading = false;
        this.applySettings(response.settings);
        this.changeDetectorRef.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.loadError = 'Failed to load settings.';
        this.changeDetectorRef.markForCheck();
      }
    });
  }

  private applySettings(settings: UserSettingsDocument): void {
    this.schemaVersion = settings.schemaVersion || 1;
    this.focusAreas = (settings.reviewPreferences.focusAreas?.length
      ? settings.reviewPreferences.focusAreas
      : ['bugs', 'security', 'quality']).map(area => area.toLowerCase());

    this.form.patchValue({
      displayName: settings.profile.displayName ?? '',
      timezone: settings.profile.timezone ?? '',
      depth: settings.reviewPreferences.depth,
      outputLength: settings.reviewPreferences.outputLength,
      autoLoadLatestReview: settings.reviewPreferences.autoLoadLatestReview,
      autoGenerateWhenMissing: settings.reviewPreferences.autoGenerateWhenMissing,
      showCooldownHints: settings.uiPreferences.showCooldownHints,
      defaultRepositoryOwner: settings.repositoryPreferences.defaultRepository?.owner ?? '',
      defaultRepositoryName: settings.repositoryPreferences.defaultRepository?.name ?? '',
      excludedRepositoriesText: this.formatExcludedRepositories(settings.repositoryPreferences.excludedRepositories)
    }, { emitEvent: false });

    this.form.markAsPristine();
  }

  private normalizeFocusAreas(): Array<'bugs' | 'security' | 'quality' | 'performance' | 'maintainability'> {
    return this.focusAreas
      .map(area => area.toLowerCase())
      .filter((area, index, all) => this.focusAreaOptions.includes(area as (typeof this.focusAreaOptions)[number]) && all.indexOf(area) === index)
      .slice(0, 5) as Array<'bugs' | 'security' | 'quality' | 'performance' | 'maintainability'>;
  }

  private parseExcludedRepositories(input: string): Array<{ owner: string; name: string }> {
    return input
      .split('\n')
      .map(line => line.trim())
      .filter(line => !!line)
      .map(line => {
        const splitIndex = line.indexOf('/');
        if (splitIndex <= 0 || splitIndex === line.length - 1) {
          return null;
        }

        const owner = line.slice(0, splitIndex).trim();
        const name = line.slice(splitIndex + 1).trim();
        if (!owner || !name) {
          return null;
        }

        return { owner, name };
      })
      .filter((repo): repo is { owner: string; name: string } => repo !== null);
  }

  private formatExcludedRepositories(repositories: Array<{ owner: string; name: string }>): string {
    return repositories.map(repo => `${repo.owner}/${repo.name}`).join('\n');
  }

  private toNullable(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}
