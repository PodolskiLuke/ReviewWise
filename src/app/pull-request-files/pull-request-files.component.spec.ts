import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { of } from 'rxjs';
import { PullRequestFilesComponent } from './pull-request-files.component';
import { ReviewWiseApiService } from '../services/reviewwise-api.service';
import * as ReviewDataActions from '../state/review-data/review-data.actions';
import { ReviewDataState } from '../state/review-data/review-data.reducer';

describe('PullRequestFilesComponent', () => {
  let fixture: ComponentFixture<PullRequestFilesComponent>;
  let component: PullRequestFilesComponent;
  let store: MockStore;
  let apiServiceSpy: jasmine.SpyObj<ReviewWiseApiService>;

  const initialReviewDataState: ReviewDataState = {
    repositories: [],
    repositoriesLoading: false,
    repositoriesError: null,
    selectedRepository: null,
    pullRequests: [],
    pullRequestsLoading: false,
    pullRequestsError: null,
    selectedPullRequest: null,
    pullRequestFiles: [],
    pullRequestFilesLoading: false,
    pullRequestFilesError: null,
    reviewLoading: false,
    reviewError: null,
    reviewText: null,
    reviewMeta: null,
    reviewStatusMessage: null,
    reviewRetryAfterSeconds: null
  };

  beforeEach(async () => {
    apiServiceSpy = jasmine.createSpyObj<ReviewWiseApiService>('ReviewWiseApiService', [
      'getPullRequestComparison',
      'getPullRequestFiles',
      'getPullRequestFileContent'
    ]);

    apiServiceSpy.getPullRequestComparison.and.returnValue(of({ diffMode: 'three-dot' }));
    apiServiceSpy.getPullRequestFiles.and.returnValue(of([
      {
        path: 'src/app/app.ts',
        status: 'modified',
        patch: '@@ -1 +1 @@\n-old\n+new'
      }
    ]));
    apiServiceSpy.getPullRequestFileContent.and.returnValue(of({ oldContent: 'old', newContent: 'new' }));

    await TestBed.configureTestingModule({
      imports: [PullRequestFilesComponent],
      providers: [
        provideMockStore({ initialState: { reviewData: initialReviewDataState } }),
        { provide: ReviewWiseApiService, useValue: apiServiceSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({
                owner: 'owner1',
                repo: 'repo1',
                prNumber: '12'
              })
            }
          }
        }
      ]
    }).compileComponents();

    store = TestBed.inject(MockStore);
    fixture = TestBed.createComponent(PullRequestFilesComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    const dispatchSpy = spyOn(store, 'dispatch');
    fixture.detectChanges();

    expect(component).toBeTruthy();
    expect(dispatchSpy).toHaveBeenCalledWith(
      ReviewDataActions.loadLatestReview({ owner: 'owner1', repo: 'repo1', prNumber: 12 })
    );
  });

  it('should dispatch generateReview when generate button action is called', () => {
    const dispatchSpy = spyOn(store, 'dispatch');
    fixture.detectChanges();

    component.generateReview();

    expect(dispatchSpy).toHaveBeenCalledWith(
      ReviewDataActions.generateReview({ owner: 'owner1', repo: 'repo1', prNumber: 12 })
    );
  });

  it('should not dispatch generateReview while cooldown is active', () => {
    const dispatchSpy = spyOn(store, 'dispatch');
    fixture.detectChanges();
    component.reviewRetryCountdown.set(10);

    component.generateReview();

    expect(dispatchSpy).not.toHaveBeenCalledWith(
      ReviewDataActions.generateReview({ owner: 'owner1', repo: 'repo1', prNumber: 12 })
    );
  });

  it('should render review section on the PR changes page', () => {
    fixture.detectChanges();

    const reviewTitle = fixture.nativeElement.querySelector('.review-panel h2')?.textContent?.trim();
    const generateButton = fixture.nativeElement.querySelector('.review-panel .review-actions button');

    expect(reviewTitle).toBe('AI review');
    expect(generateButton).toBeTruthy();
  });

  it('should render review status message from store state', () => {
    fixture.detectChanges();

    store.setState({
      reviewData: {
        ...initialReviewDataState,
        reviewStatusMessage: 'Latest review loaded and displayed.'
      }
    });
    store.refreshState();
    fixture.detectChanges();

    const statusMessage = fixture.nativeElement.querySelector('.review-status')?.textContent?.trim();
    expect(statusMessage).toContain('Latest review loaded and displayed.');
  });

  it('should render review text output from store state', () => {
    fixture.detectChanges();

    store.setState({
      reviewData: {
        ...initialReviewDataState,
        reviewText: 'AI summary line 1\nAI summary line 2'
      }
    });
    store.refreshState();
    fixture.detectChanges();

    const reviewOutput = fixture.nativeElement.querySelector('.review-output')?.textContent?.trim();
    expect(reviewOutput).toContain('AI summary line 1');
    expect(reviewOutput).toContain('AI summary line 2');
  });

  it('should not render review output when review text is null', () => {
    fixture.detectChanges();

    store.setState({
      reviewData: {
        ...initialReviewDataState,
        reviewText: null
      }
    });
    store.refreshState();
    fixture.detectChanges();

    const reviewOutput = fixture.nativeElement.querySelector('.review-output');
    expect(reviewOutput).toBeNull();
  });
});
