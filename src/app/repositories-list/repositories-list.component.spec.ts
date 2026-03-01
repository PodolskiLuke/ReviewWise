import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { RepositoriesListComponent } from './repositories-list.component';
import * as ReviewDataActions from '../state/review-data/review-data.actions';
import { ReviewDataState } from '../state/review-data/review-data.reducer';

describe('RepositoriesListComponent', () => {
  let fixture: ComponentFixture<RepositoriesListComponent>;
  let component: RepositoriesListComponent;
  let store: MockStore;

  const initialReviewDataState: ReviewDataState = {
    repositories: [],
    repositoriesLoading: false,
    repositoriesError: null,
    selectedRepository: null,
    pullRequests: [],
    pullRequestsLoading: false,
    pullRequestsError: null,
    selectedPullRequest: null,
    reviewLoading: false,
    reviewError: null,
    reviewText: null,
    reviewMeta: null,
    reviewStatusMessage: null,
    reviewRetryAfterSeconds: null
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RepositoriesListComponent],
      providers: [
        provideMockStore({ initialState: { reviewData: initialReviewDataState } })
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
    expect(dispatchSpy.calls.count()).toBe(1);
  });

  it('should dispatch latest review load when selecting a pull request', () => {
    component.selectedRepo = { id: 1, name: 'repo1', owner: { login: 'owner1' } };
    const pullRequest = { number: 7, title: 'Improve API' };
    const dispatchSpy = spyOn(store, 'dispatch');

    component.selectPullRequest(pullRequest);

    expect(dispatchSpy).toHaveBeenCalledWith(ReviewDataActions.selectPullRequest({ pullRequest }));
    expect(dispatchSpy).toHaveBeenCalledWith(
      ReviewDataActions.loadLatestReview({ owner: 'owner1', repo: 'repo1', prNumber: 7 })
    );
  });

  it('should dispatch generate review action for selected pull request', () => {
    component.selectedRepo = { id: 1, name: 'repo1', owner: { login: 'owner1' } };
    component.selectedPullRequest = { number: 8, title: 'Refactor service' };
    const dispatchSpy = spyOn(store, 'dispatch');

    component.generateReview();

    expect(dispatchSpy).toHaveBeenCalledWith(
      ReviewDataActions.generateReview({ owner: 'owner1', repo: 'repo1', prNumber: 8 })
    );
  });

  it('should dispatch latest review load when requested explicitly', () => {
    component.selectedRepo = { id: 1, name: 'repo1', owner: { login: 'owner1' } };
    component.selectedPullRequest = { number: 8, title: 'Refactor service' };
    const dispatchSpy = spyOn(store, 'dispatch');

    component.viewLatestReview();

    expect(dispatchSpy).toHaveBeenCalledWith(
      ReviewDataActions.loadLatestReview({ owner: 'owner1', repo: 'repo1', prNumber: 8 })
    );
  });

  it('should not dispatch generate review while cooldown is active', () => {
    component.selectedRepo = { id: 1, name: 'repo1', owner: { login: 'owner1' } };
    component.selectedPullRequest = { number: 8, title: 'Refactor service' };
    component.reviewRetryCountdown = 10;
    const dispatchSpy = spyOn(store, 'dispatch');

    component.generateReview();

    expect(dispatchSpy).not.toHaveBeenCalledWith(
      ReviewDataActions.generateReview({ owner: 'owner1', repo: 'repo1', prNumber: 8 })
    );
  });

  it('should expose cooldown-aware generate button label', () => {
    component.reviewLoading = false;
    component.reviewRetryCountdown = 7;

    expect(component.generateButtonLabel).toBe('Try again in 7s');
    expect(component.isGenerateButtonDisabled).toBeTrue();
  });
});
