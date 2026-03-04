import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Actions } from '@ngrx/effects';
import { Action } from '@ngrx/store';
import { ReplaySubject, firstValueFrom, of, throwError } from 'rxjs';
import { ReviewWiseApiService } from '../../services/reviewwise-api.service';
import { ReviewDataEffects } from './review-data.effects';
import * as ReviewDataActions from './review-data.actions';

describe('ReviewDataEffects', () => {
  let actions$: ReplaySubject<Action>;
  let effects: ReviewDataEffects;
  let apiServiceSpy: jasmine.SpyObj<ReviewWiseApiService>;

  beforeEach(() => {
    actions$ = new ReplaySubject<Action>(1);
    apiServiceSpy = jasmine.createSpyObj<ReviewWiseApiService>('ReviewWiseApiService', [
      'getRepositories',
      'getPullRequests',
      'getReviewResult',
      'triggerReview'
    ]);

    TestBed.configureTestingModule({
      providers: [
        ReviewDataEffects,
        { provide: ReviewWiseApiService, useValue: apiServiceSpy },
        { provide: Actions, useFactory: () => new Actions(actions$) }
      ]
    });

    effects = TestBed.inject(ReviewDataEffects);
  });

  it('should create effects instance', () => {
    expect(effects).toBeTruthy();
  });

  it('should emit loadRepositoriesSuccess when repositories API succeeds', async () => {
    const repositories = [{ id: 1, name: 'ReviewWise' }];
    apiServiceSpy.getRepositories.and.returnValue(of(repositories));

    const resultPromise = firstValueFrom(effects.loadRepositories$);
    actions$.next(ReviewDataActions.loadRepositories());

    const result = await resultPromise;

    expect(result).toEqual(ReviewDataActions.loadRepositoriesSuccess({ repositories }));
  });

  it('should emit loadPullRequestsFailure when pull requests API is unauthorized', async () => {
    apiServiceSpy.getPullRequests.and.returnValue(throwError(() => ({ status: 401 })));

    const resultPromise = firstValueFrom(effects.loadPullRequests$);
    actions$.next(ReviewDataActions.loadPullRequests({ owner: 'owner1', repo: 'repo1' }));

    const result = await resultPromise;

    expect(result).toEqual(
      ReviewDataActions.loadPullRequestsFailure({
        error: 'Please log in to view pull requests.'
      })
    );
  });

  it('should emit loadLatestReviewSuccess when latest review exists', async () => {
    apiServiceSpy.getReviewResult.and.returnValue(of({
      review: 'Stored review text',
      createdAt: '2026-03-01T10:00:00Z',
      username: 'reviewer1'
    }));

    const resultPromise = firstValueFrom(effects.loadLatestReview$);
    actions$.next(ReviewDataActions.loadLatestReview({ owner: 'owner1', repo: 'repo1', prNumber: 8 }));

    const result = await resultPromise;

    expect(result.type).toBe(ReviewDataActions.loadLatestReviewSuccess.type);
    expect((result as ReturnType<typeof ReviewDataActions.loadLatestReviewSuccess>).owner).toBe('owner1');
    expect((result as ReturnType<typeof ReviewDataActions.loadLatestReviewSuccess>).repo).toBe('repo1');
    expect((result as ReturnType<typeof ReviewDataActions.loadLatestReviewSuccess>).prNumber).toBe(8);
    expect((result as ReturnType<typeof ReviewDataActions.loadLatestReviewSuccess>).reviewText).toBe('Stored review text');
    expect((result as ReturnType<typeof ReviewDataActions.loadLatestReviewSuccess>).reviewStatusMessage).toBe('Latest review loaded and displayed.');
  });

  it('should emit empty latest-review success when latest review is missing', async () => {
    apiServiceSpy.getReviewResult.and.returnValue(of({ review: null }));

    const resultPromise = firstValueFrom(effects.loadLatestReview$);
    actions$.next(ReviewDataActions.loadLatestReview({ owner: 'owner1', repo: 'repo1', prNumber: 9 }));

    const result = await resultPromise;

    expect(result).toEqual(
      ReviewDataActions.loadLatestReviewSuccess({
        owner: 'owner1',
        repo: 'repo1',
        prNumber: 9,
        reviewText: null,
        reviewMeta: null,
        reviewStatusMessage: 'No saved review yet. Click Generate review to create one.'
      })
    );
  });

  it('should emit loadLatestReviewFailure with status code when latest review API fails', async () => {
    apiServiceSpy.getReviewResult.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

    const resultPromise = firstValueFrom(effects.loadLatestReview$);
    actions$.next(ReviewDataActions.loadLatestReview({ owner: 'owner1', repo: 'repo1', prNumber: 13 }));

    const result = await resultPromise;

    expect(result).toEqual(
      ReviewDataActions.loadLatestReviewFailure({
        owner: 'owner1',
        repo: 'repo1',
        prNumber: 13,
        error: 'Failed to load review result.',
        reviewStatusMessage: 'Loading latest review failed.',
        statusCode: 404
      })
    );
  });

  it('should auto-generate review when latest review success has empty review text', async () => {
    const resultPromise = firstValueFrom(effects.autoGenerateReviewWhenMissing$);
    actions$.next(ReviewDataActions.loadLatestReviewSuccess({
      owner: 'owner1',
      repo: 'repo1',
      prNumber: 22,
      reviewText: null,
      reviewMeta: null,
      reviewStatusMessage: 'No saved review yet. Click Generate review to create one.'
    }));

    const result = await resultPromise;

    expect(result).toEqual(
      ReviewDataActions.generateReview({ owner: 'owner1', repo: 'repo1', prNumber: 22 })
    );
  });

  it('should auto-generate review when latest review request fails with 404', async () => {
    const resultPromise = firstValueFrom(effects.autoGenerateReviewOnNotFound$);
    actions$.next(ReviewDataActions.loadLatestReviewFailure({
      owner: 'owner1',
      repo: 'repo1',
      prNumber: 23,
      error: 'Failed to load review result.',
      reviewStatusMessage: 'Loading latest review failed.',
      statusCode: 404
    }));

    const result = await resultPromise;

    expect(result).toEqual(
      ReviewDataActions.generateReview({ owner: 'owner1', repo: 'repo1', prNumber: 23 })
    );
  });

  it('should emit generateReviewSuccess when review generation succeeds', async () => {
    apiServiceSpy.triggerReview.and.returnValue(of({
      review: 'Generated review content',
      createdAt: '2026-03-01T12:34:56Z',
      username: 'reviewer2',
      reused: false
    }));

    const resultPromise = firstValueFrom(effects.generateReview$);
    actions$.next(ReviewDataActions.generateReview({ owner: 'owner1', repo: 'repo1', prNumber: 7 }));

    const result = await resultPromise;

    expect(result.type).toBe(ReviewDataActions.generateReviewSuccess.type);
    expect((result as ReturnType<typeof ReviewDataActions.generateReviewSuccess>).reviewText).toBe('Generated review content');
    expect((result as ReturnType<typeof ReviewDataActions.generateReviewSuccess>).reviewStatusMessage).toBe('Review generated and displayed.');
  });

  it('should emit generateReviewSuccess with reuse message when backend reuses existing review', async () => {
    apiServiceSpy.triggerReview.and.returnValue(of({
      review: 'Existing review content',
      createdAt: '2026-03-01T09:00:00Z',
      username: 'reviewer1',
      reused: true
    }));

    const resultPromise = firstValueFrom(effects.generateReview$);
    actions$.next(ReviewDataActions.generateReview({ owner: 'owner1', repo: 'repo1', prNumber: 11 }));

    const result = await resultPromise;

    expect(result.type).toBe(ReviewDataActions.generateReviewSuccess.type);
    expect((result as ReturnType<typeof ReviewDataActions.generateReviewSuccess>).reviewText).toBe('Existing review content');
    expect((result as ReturnType<typeof ReviewDataActions.generateReviewSuccess>).reviewStatusMessage).toBe('Existing saved review loaded and displayed.');
  });

  it('should emit generateReviewFailure with retry seconds when backend returns 429 body payload', async () => {
    apiServiceSpy.triggerReview.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 429,
      error: { retryAfterSeconds: 42 }
    })));

    const resultPromise = firstValueFrom(effects.generateReview$);
    actions$.next(ReviewDataActions.generateReview({ owner: 'owner1', repo: 'repo1', prNumber: 15 }));

    const result = await resultPromise;

    expect(result).toEqual(
      ReviewDataActions.generateReviewFailure({
        error: 'Review generation is rate-limited. Try again in 42 seconds.',
        reviewStatusMessage: 'Review generation is rate-limited. Try again in 42 seconds.',
        retryAfterSeconds: 42
      })
    );
  });

  it('should emit generateReviewFailure with retry seconds from Retry-After header when body payload is missing', async () => {
    const headers = new HttpHeaders({ 'Retry-After': '18' });
    apiServiceSpy.triggerReview.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 429,
      headers,
      error: { message: 'Too many requests' }
    })));

    const resultPromise = firstValueFrom(effects.generateReview$);
    actions$.next(ReviewDataActions.generateReview({ owner: 'owner1', repo: 'repo1', prNumber: 16 }));

    const result = await resultPromise;

    expect(result).toEqual(
      ReviewDataActions.generateReviewFailure({
        error: 'Review generation is rate-limited. Try again in 18 seconds.',
        reviewStatusMessage: 'Review generation is rate-limited. Try again in 18 seconds.',
        retryAfterSeconds: 18
      })
    );
  });

  it('should emit generateReviewFailure with backend message when provider returns a specific error', async () => {
    apiServiceSpy.triggerReview.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 502,
      error: { message: "Configured OpenAI model 'gpt-4' is not available for this API key." }
    })));

    const resultPromise = firstValueFrom(effects.generateReview$);
    actions$.next(ReviewDataActions.generateReview({ owner: 'owner1', repo: 'repo1', prNumber: 17 }));

    const result = await resultPromise;

    expect(result).toEqual(
      ReviewDataActions.generateReviewFailure({
        error: "Configured OpenAI model 'gpt-4' is not available for this API key.",
        reviewStatusMessage: 'Review generation failed.'
      })
    );
  });
});
