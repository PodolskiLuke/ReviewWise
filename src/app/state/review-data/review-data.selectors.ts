import { createSelector } from '@ngrx/store';
import { reviewDataFeature } from './review-data.reducer';

export const {
  name: reviewDataFeatureKey,
  selectReviewDataState,
  selectRepositories,
  selectRepositoriesLoading,
  selectRepositoriesError,
  selectSelectedRepository,
  selectPullRequests,
  selectPullRequestsLoading,
  selectPullRequestsError
} = reviewDataFeature;

export const selectHasRepositories = createSelector(
  selectRepositories,
  (repositories) => repositories.length > 0
);
