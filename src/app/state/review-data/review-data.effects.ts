import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, of, switchMap, timeout } from 'rxjs';
import { ReviewWiseApiService } from '../../services/reviewwise-api.service';
import * as ReviewDataActions from './review-data.actions';

@Injectable()
export class ReviewDataEffects {
  readonly loadRepositories$;
  readonly loadPullRequests$;

  constructor(private actions$: Actions, private api: ReviewWiseApiService) {
    this.loadRepositories$ = createEffect(() =>
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

    this.loadPullRequests$ = createEffect(() =>
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
