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
