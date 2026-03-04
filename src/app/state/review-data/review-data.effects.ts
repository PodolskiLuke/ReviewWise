import { inject, Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, filter, map, of, switchMap, timeout } from 'rxjs';
import { ReviewWiseApiService } from '../../services/reviewwise-api.service';
import * as ReviewDataActions from './review-data.actions';

@Injectable()
export class ReviewDataEffects {
  private readonly actions$ = inject(Actions);
  private readonly api = inject(ReviewWiseApiService);

  readonly loadRepositories$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewDataActions.loadRepositories),
      switchMap(() =>
        this.api.getRepositories().pipe(
          map((response) => {
            const repositories = Array.isArray(response) ? response : [];
            return ReviewDataActions.loadRepositoriesSuccess({ repositories });
          }),
          catchError((err: HttpErrorResponse) => {
            const error = err.status === 401 || err.status === 403
              ? 'Please log in to view repositories.'
              : 'Failed to load repositories.';
            return of(ReviewDataActions.loadRepositoriesFailure({ error }));
          })
        )
      )
    )
  );

  readonly loadPullRequests$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewDataActions.loadPullRequests),
      switchMap(({ owner, repo }) =>
        this.api.getPullRequests(owner, repo).pipe(
          timeout(15000),
          map((response) => {
            const pullRequests = this.normalizePullRequests(response);
            if (!pullRequests) {
              return ReviewDataActions.loadPullRequestsFailure({
                error: 'Pull requests could not be read from the provider response.'
              });
            }

            return ReviewDataActions.loadPullRequestsSuccess({ pullRequests });
          }),
          catchError((err: HttpErrorResponse | { name?: string }) => {
            const isTimeout = (err as { name?: string })?.name === 'TimeoutError';
            const status = (err as HttpErrorResponse)?.status;

            const error = isTimeout
              ? 'Timed out while loading pull requests. Please try selecting the repository again.'
              : status === 401 || status === 403
                ? 'Please log in to view pull requests.'
                : 'Failed to load pull requests.';

            return of(ReviewDataActions.loadPullRequestsFailure({ error }));
          })
        )
      )
    )
  );

  readonly loadLatestReview$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewDataActions.loadLatestReview),
      switchMap(({ owner, repo, prNumber }) =>
        this.api.getReviewResult(owner, repo, prNumber).pipe(
          map((response: { review?: string; createdAt?: string; username?: string }) => {
            const reviewText = response?.review ?? null;
            if (!reviewText) {
              return ReviewDataActions.loadLatestReviewSuccess({
                owner,
                repo,
                prNumber,
                reviewText: null,
                reviewMeta: null,
                reviewStatusMessage: 'No saved review yet. Click Generate review to create one.'
              });
            }

            return ReviewDataActions.loadLatestReviewSuccess({
              owner,
              repo,
              prNumber,
              reviewText,
              reviewMeta: this.buildReviewMeta(response),
              reviewStatusMessage: 'Latest review loaded and displayed.'
            });
          }),
          catchError((err: HttpErrorResponse) => {
            return of(ReviewDataActions.loadLatestReviewFailure({
              owner,
              repo,
              prNumber,
              error: err.status === 401 || err.status === 403
                ? 'Please log in to view review results.'
                : 'Failed to load review result.',
              reviewStatusMessage: 'Loading latest review failed.',
              statusCode: Number.isFinite(err.status) ? err.status : null
            }));
          })
        )
      )
    )
  );

  readonly autoGenerateReviewWhenMissing$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewDataActions.loadLatestReviewSuccess),
      filter(({ reviewText }) => !reviewText || reviewText.trim().length === 0),
      map(({ owner, repo, prNumber }) => ReviewDataActions.generateReview({ owner, repo, prNumber }))
    )
  );

  readonly autoGenerateReviewOnNotFound$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewDataActions.loadLatestReviewFailure),
      filter(({ statusCode }) => statusCode === 404),
      map(({ owner, repo, prNumber }) => ReviewDataActions.generateReview({ owner, repo, prNumber }))
    )
  );

  readonly loadPullRequestFiles$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewDataActions.loadPullRequestFiles),
      switchMap(({ owner, repo, prNumber }) =>
        this.api.getPullRequestFiles(owner, repo, prNumber).pipe(
          timeout(15000),
          map((response) => {
            const pullRequestFiles = this.normalizePullRequests(response);
            if (!pullRequestFiles) {
              return ReviewDataActions.loadPullRequestFilesFailure({
                error: 'Changed files could not be read from the provider response.'
              });
            }

            return ReviewDataActions.loadPullRequestFilesSuccess({ pullRequestFiles });
          }),
          catchError((err: HttpErrorResponse | { name?: string }) => {
            const isTimeout = (err as { name?: string })?.name === 'TimeoutError';
            const status = (err as HttpErrorResponse)?.status;

            const error = isTimeout
              ? 'Timed out while loading changed files. Please try selecting the pull request again.'
              : status === 401 || status === 403
                ? 'Please log in to view changed files.'
                : 'Failed to load changed files.';

            return of(ReviewDataActions.loadPullRequestFilesFailure({ error }));
          })
        )
      )
    )
  );

  readonly generateReview$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewDataActions.generateReview),
      switchMap(({ owner, repo, prNumber }) =>
        this.api.triggerReview(owner, repo, prNumber).pipe(
          map((response: { review?: string; createdAt?: string; username?: string; reused?: boolean }) => ReviewDataActions.generateReviewSuccess({
            reviewText: response?.review ?? 'Review generated, but no text was returned.',
            reviewMeta: this.buildReviewMeta(response) ?? (response?.reused ? 'Latest saved review loaded' : 'Generated just now'),
            reviewStatusMessage: response?.reused
              ? 'Existing saved review loaded and displayed.'
              : 'Review generated and displayed.'
          })),
          catchError((err: HttpErrorResponse) => {
            if (err.status === 429) {
              const retryAfterSeconds = this.getRetryAfterSeconds(err);
              const retryMessage = retryAfterSeconds
                ? `Review generation is rate-limited. Try again in ${retryAfterSeconds} seconds.`
                : 'Review generation is rate-limited. Please wait a moment and try again.';

              return of(ReviewDataActions.generateReviewFailure({
                error: retryMessage,
                reviewStatusMessage: retryMessage,
                retryAfterSeconds
              }));
            }

            const backendMessage = this.getBackendErrorMessage(err);

            return of(ReviewDataActions.generateReviewFailure({
              error: backendMessage ?? (err.status === 401 || err.status === 403
                ? 'Please log in to generate a review.'
                : 'Failed to generate review.'),
              reviewStatusMessage: 'Review generation failed.'
            }));
          })
        )
      )
    )
  );

  private getRetryAfterSeconds(err: HttpErrorResponse): number | null {
    const bodyRetry = this.parsePositiveInteger((err.error as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds);
    if (bodyRetry) {
      return bodyRetry;
    }

    const headerRetry = err.headers?.get('Retry-After');
    return this.parsePositiveInteger(headerRetry);
  }

  private parsePositiveInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }

    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
  }

  private getBackendErrorMessage(err: HttpErrorResponse): string | null {
    const body = err.error as { message?: unknown } | string | null;
    if (body && typeof body === 'object' && typeof body.message === 'string' && body.message.trim().length > 0) {
      return body.message;
    }

    if (typeof body === 'string' && body.trim().length > 0) {
      return body;
    }

    return null;
  }

  private buildReviewMeta(response: { createdAt?: string; username?: string }): string | null {
    if (!response?.createdAt && !response?.username) {
      return null;
    }

    const created = response.createdAt ? new Date(response.createdAt).toLocaleString() : null;
    const user = response.username ? ` by ${response.username}` : '';
    return created ? `Latest saved review: ${created}${user}` : `Latest saved review${user}`;
  }

  private normalizePullRequests(response: unknown): any[] | null {
    if (Array.isArray(response)) {
      return response;
    }

    if (typeof response === 'string') {
      try {
        const parsed = JSON.parse(response);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }

    if (response && typeof response === 'object') {
      const maybeContainer = response as { pullRequests?: unknown; data?: unknown; items?: unknown };
      if (Array.isArray(maybeContainer.pullRequests)) {
        return maybeContainer.pullRequests;
      }

      if (Array.isArray(maybeContainer.data)) {
        return maybeContainer.data;
      }

      if (Array.isArray(maybeContainer.items)) {
        return maybeContainer.items;
      }
    }

    return null;
  }
}
