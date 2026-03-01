import { createAction, props } from '@ngrx/store';

export const loadRepositories = createAction('[Review Data] Load Repositories');

export const loadRepositoriesSuccess = createAction(
  '[Review Data] Load Repositories Success',
  props<{ repositories: any[] }>()
);

export const loadRepositoriesFailure = createAction(
  '[Review Data] Load Repositories Failure',
  props<{ error: string }>()
);

export const selectRepository = createAction(
  '[Review Data] Select Repository',
  props<{ repository: any | null }>()
);

export const loadPullRequests = createAction(
  '[Review Data] Load Pull Requests',
  props<{ owner: string; repo: string }>()
);

export const loadPullRequestsSuccess = createAction(
  '[Review Data] Load Pull Requests Success',
  props<{ pullRequests: any[] }>()
);

export const loadPullRequestsFailure = createAction(
  '[Review Data] Load Pull Requests Failure',
  props<{ error: string }>()
);

export const selectPullRequest = createAction(
  '[Review Data] Select Pull Request',
  props<{ pullRequest: any | null }>()
);

export const loadLatestReview = createAction(
  '[Review Data] Load Latest Review',
  props<{ owner: string; repo: string; prNumber: number }>()
);

export const loadLatestReviewSuccess = createAction(
  '[Review Data] Load Latest Review Success',
  props<{ reviewText: string | null; reviewMeta: string | null; reviewStatusMessage: string }>()
);

export const loadLatestReviewFailure = createAction(
  '[Review Data] Load Latest Review Failure',
  props<{ error: string | null; reviewStatusMessage: string }>()
);

export const generateReview = createAction(
  '[Review Data] Generate Review',
  props<{ owner: string; repo: string; prNumber: number }>()
);

export const generateReviewSuccess = createAction(
  '[Review Data] Generate Review Success',
  props<{ reviewText: string; reviewMeta: string; reviewStatusMessage: string }>()
);

export const generateReviewFailure = createAction(
  '[Review Data] Generate Review Failure',
  props<{ error: string; reviewStatusMessage: string; retryAfterSeconds?: number | null }>()
);
