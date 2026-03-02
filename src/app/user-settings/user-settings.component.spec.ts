import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { UserSettingsDocument } from '../models/user-settings.models';
import { ReviewWiseApiService } from '../services/reviewwise-api.service';
import { UserSettingsComponent } from './user-settings.component';

describe('UserSettingsComponent', () => {
  let fixture: ComponentFixture<UserSettingsComponent>;
  let component: UserSettingsComponent;
  let apiSpy: jasmine.SpyObj<ReviewWiseApiService>;

  const baseSettings: UserSettingsDocument = {
    schemaVersion: 1,
    profile: {
      displayName: 'ci-user',
      timezone: 'Europe/London'
    },
    reviewPreferences: {
      depth: 'standard',
      focusAreas: ['bugs', 'security', 'quality'],
      outputLength: 'medium',
      autoLoadLatestReview: true,
      autoGenerateWhenMissing: true
    },
    repositoryPreferences: {
      defaultRepository: {
        owner: 'PodolskiLuke',
        name: 'ReviewWise'
      },
      excludedRepositories: []
    },
    uiPreferences: {
      showCooldownHints: true
    },
    updatedAt: null
  };

  beforeEach(async () => {
    apiSpy = jasmine.createSpyObj<ReviewWiseApiService>('ReviewWiseApiService', ['getUserSettings', 'updateUserSettings']);

    await TestBed.configureTestingModule({
      imports: [UserSettingsComponent],
      providers: [{ provide: ReviewWiseApiService, useValue: apiSpy }]
    }).compileComponents();
  });

  it('should create and load settings on init', () => {
    apiSpy.getUserSettings.and.returnValue(of({ settings: baseSettings }));

    fixture = TestBed.createComponent(UserSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component).toBeTruthy();
    expect(apiSpy.getUserSettings).toHaveBeenCalled();
    expect(component.loading).toBeFalse();
    expect(component.loadError).toBeNull();
    expect(component.form.get('displayName')?.value).toBe('ci-user');
    expect(component.form.get('timezone')?.value).toBe('Europe/London');
    expect(component.isFocusAreaChecked('bugs')).toBeTrue();
  });

  it('should surface load error when get settings fails', () => {
    apiSpy.getUserSettings.and.returnValue(throwError(() => new Error('load failed')));

    fixture = TestBed.createComponent(UserSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.loading).toBeFalse();
    expect(component.loadError).toBe('Failed to load settings.');
  });

  it('should save settings successfully', () => {
    apiSpy.getUserSettings.and.returnValue(of({ settings: baseSettings }));
    apiSpy.updateUserSettings.and.returnValue(of({ settings: baseSettings }));

    fixture = TestBed.createComponent(UserSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.form.patchValue({
      displayName: 'updated-user',
      timezone: 'UTC',
      depth: 'deep',
      outputLength: 'long',
      autoGenerateWhenMissing: false,
      defaultRepositoryOwner: 'owner2',
      defaultRepositoryName: 'repo2',
      excludedRepositoriesText: 'ownerX/repoX\ninvalidline'
    });
    component.onFocusAreaToggle('performance', true);

    component.save();

    expect(apiSpy.updateUserSettings).toHaveBeenCalled();
    const payload = apiSpy.updateUserSettings.calls.mostRecent().args[0];
    expect(payload.profile.displayName).toBe('updated-user');
    expect(payload.profile.timezone).toBe('UTC');
    expect(payload.reviewPreferences.depth).toBe('deep');
    expect(payload.reviewPreferences.outputLength).toBe('long');
    expect(payload.reviewPreferences.autoGenerateWhenMissing).toBeFalse();
    expect(payload.reviewPreferences.focusAreas).toContain('performance');
    expect(payload.repositoryPreferences.defaultRepository).toEqual({ owner: 'owner2', name: 'repo2' });
    expect(payload.repositoryPreferences.excludedRepositories).toEqual([{ owner: 'ownerX', name: 'repoX' }]);
    expect(component.saveSuccess).toBe('Settings saved.');
    expect(component.saveError).toBeNull();
    expect(component.saving).toBeFalse();
  });

  it('should surface save error when update fails', () => {
    apiSpy.getUserSettings.and.returnValue(of({ settings: baseSettings }));
    apiSpy.updateUserSettings.and.returnValue(throwError(() => new Error('save failed')));

    fixture = TestBed.createComponent(UserSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.save();

    expect(component.saveError).toBe('Failed to save settings.');
    expect(component.saveSuccess).toBeNull();
    expect(component.saving).toBeFalse();
  });
});
