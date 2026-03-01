import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { of } from 'rxjs';
import { RepositoriesListComponent } from './repositories-list.component';
import { ReviewWiseApiService } from '../services/reviewwise-api.service';
import * as ReviewDataActions from '../state/review-data/review-data.actions';
import { ReviewDataState } from '../state/review-data/review-data.reducer';

describe('RepositoriesListComponent', () => {
  let fixture: ComponentFixture<RepositoriesListComponent>;
  let component: RepositoriesListComponent;
  let store: MockStore;
  let apiServiceSpy: jasmine.SpyObj<ReviewWiseApiService>;

  const initialReviewDataState: ReviewDataState = {
    repositories: [],
    repositoriesLoading: false,
    repositoriesError: null,
    selectedRepository: null,
    pullRequests: [],
    pullRequestsLoading: false,
    pullRequestsError: null
  };

  beforeEach(async () => {
    apiServiceSpy = jasmine.createSpyObj<ReviewWiseApiService>(
      'ReviewWiseApiService',
      ['getRepositories', 'getPullRequests', 'getReviewResult', 'triggerReview']
    );

    await TestBed.configureTestingModule({
      imports: [RepositoriesListComponent],
      providers: [
        provideMockStore({ initialState: { reviewData: initialReviewDataState } }),
        { provide: ReviewWiseApiService, useValue: apiServiceSpy }
      ],
    }).compileComponents();

    store = TestBed.inject(MockStore);
    fixture = TestBed.createComponent(RepositoriesListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    spyOn(store, 'dispatch');
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should dispatch repository load on init', () => {
    const dispatchSpy = spyOn(store, 'dispatch');
    fixture.detectChanges();
    expect(dispatchSpy).toHaveBeenCalledWith(ReviewDataActions.loadRepositories());
  });

  it('should filter repositories by search term', () => {
    component.repositories = [
      { id: 1, name: 'ReviewWise' },
      { id: 2, name: 'api-service' },
      { id: 3, name: 'frontend' },
    ];

    component.onSearch('REVIEW');

    expect(component.searchTerm).toBe('REVIEW');
    expect(component.filteredRepositories).toEqual([{ id: 1, name: 'ReviewWise' }]);
  });

  it('should dispatch repository and pull request load when selecting a repository', () => {
    const repository = { id: 10, name: 'selected-repo', owner: { login: 'owner1' } };
    const dispatchSpy = spyOn(store, 'dispatch');

    component.selectRepo(repository);

    expect(component.selectedRepo).toEqual(repository);
    expect(dispatchSpy).toHaveBeenCalledWith(ReviewDataActions.selectRepository({ repository }));
    expect(dispatchSpy).toHaveBeenCalledWith(ReviewDataActions.loadPullRequests({ owner: 'owner1', repo: 'selected-repo' }));
  });

  it('should only dispatch repository selection when owner info is missing', () => {
    const repository = { id: 1, name: 'repo1' };
    const dispatchSpy = spyOn(store, 'dispatch');

    component.selectRepo(repository);

    expect(dispatchSpy).toHaveBeenCalledWith(ReviewDataActions.selectRepository({ repository }));
    expect(dispatchSpy.calls.allArgs().filter((args) => (args[0] as any).type === ReviewDataActions.loadPullRequests.type).length).toBe(0);
  });

  it('should expose pull request debug state', () => {
    component.pullRequestsLoading = true;
    component.pullRequestsElapsedSeconds = 5;
    component.pullRequests = [{ number: 3, title: 'PR three' }];
    component.pullRequestsError = 'Failed to load pull requests.';

    const debugState = component.getPullRequestDebugState();

    expect(debugState).toContain('loading=true');
    expect(debugState).toContain('elapsed=5s');
    expect(debugState).toContain('count=1');
    expect(debugState).toContain('error=Failed to load pull requests.');
  });

  it('should trigger review for selected pull request', () => {
    component.selectedRepo = { id: 1, name: 'repo1', owner: { login: 'owner1' } };
    component.selectedPullRequest = { number: 7, title: 'Improve API' };
    apiServiceSpy.triggerReview.and.returnValue(of({ review: 'Looks good overall.' }));

    component.generateReview();

    expect(apiServiceSpy.triggerReview).toHaveBeenCalledWith('owner1', 'repo1', 7);
    expect(component.reviewText).toBe('Looks good overall.');
    expect(component.reviewError).toBeNull();
  });

  it('should fetch latest review when requested explicitly', () => {
    component.selectedRepo = { id: 1, name: 'repo1', owner: { login: 'owner1' } };
    component.selectedPullRequest = { number: 8, title: 'Refactor service' };
    apiServiceSpy.getReviewResult.and.returnValue(
      of({ review: 'Stored review text', createdAt: '2026-03-01T10:00:00Z', username: 'reviewer1' })
    );

    component.viewLatestReview();

    expect(apiServiceSpy.getReviewResult).toHaveBeenCalledWith('owner1', 'repo1', 8);
    expect(component.reviewText).toBe('Stored review text');
  });
});
