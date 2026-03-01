import { createFeature, createReducer, on } from '@ngrx/store';
import * as ReviewDataActions from './review-data.actions';

export interface ReviewDataState {
  repositories: any[];
  repositoriesLoading: boolean;
  repositoriesError: string | null;
  selectedRepository: any | null;
  pullRequests: any[];
  pullRequestsLoading: boolean;
  pullRequestsError: string | null;
  selectedPullRequest: any | null;
  reviewLoading: boolean;
  reviewError: string | null;
  reviewText: string | null;
  reviewMeta: string | null;
  reviewStatusMessage: string | null;
  reviewRetryAfterSeconds: number | null;
}

const initialState: ReviewDataState = {
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

export const reviewDataFeature = createFeature({
  name: 'reviewData',
  reducer: createReducer(
    initialState,
    on(ReviewDataActions.loadRepositories, (state) => ({
      ...state,
      repositoriesLoading: true,
      repositoriesError: null
    })),
    on(ReviewDataActions.loadRepositoriesSuccess, (state, { repositories }) => ({
      ...state,
      repositories,
      repositoriesLoading: false,
      repositoriesError: null
    })),
    on(ReviewDataActions.loadRepositoriesFailure, (state, { error }) => ({
      ...state,
      repositories: [],
      repositoriesLoading: false,
      repositoriesError: error
    })),
    on(ReviewDataActions.selectRepository, (state, { repository }) => ({
      ...state,
      selectedRepository: repository,
      pullRequests: [],
      pullRequestsLoading: !!repository,
      pullRequestsError: null,
      selectedPullRequest: null,
      reviewLoading: false,
      reviewError: null,
      reviewText: null,
      reviewMeta: null,
      reviewStatusMessage: null,
      reviewRetryAfterSeconds: null
    })),
    on(ReviewDataActions.loadPullRequests, (state) => ({
      ...state,
      pullRequests: [],
      pullRequestsLoading: true,
      pullRequestsError: null
    })),
    on(ReviewDataActions.loadPullRequestsSuccess, (state, { pullRequests }) => ({
      ...state,
      pullRequests,
      pullRequestsLoading: false,
      pullRequestsError: null
    })),
    on(ReviewDataActions.loadPullRequestsFailure, (state, { error }) => ({
      ...state,
      pullRequests: [],
      pullRequestsLoading: false,
      pullRequestsError: error
    })),
    on(ReviewDataActions.selectPullRequest, (state, { pullRequest }) => ({
      ...state,
      selectedPullRequest: pullRequest,
      reviewLoading: false,
      reviewError: null,
      reviewText: null,
      reviewMeta: null,
      reviewStatusMessage: null,
      reviewRetryAfterSeconds: null
    })),
    on(ReviewDataActions.loadLatestReview, (state) => ({
      ...state,
      reviewLoading: true,
      reviewError: null,
      reviewText: null,
      reviewMeta: null,
      reviewStatusMessage: 'Loading latest review.',
      reviewRetryAfterSeconds: null
    })),
    on(ReviewDataActions.loadLatestReviewSuccess, (state, { reviewText, reviewMeta, reviewStatusMessage }) => ({
      ...state,
      reviewLoading: false,
      reviewError: null,
      reviewText,
      reviewMeta,
      reviewStatusMessage,
      reviewRetryAfterSeconds: null
    })),
    on(ReviewDataActions.loadLatestReviewFailure, (state, { error, reviewStatusMessage }) => ({
      ...state,
      reviewLoading: false,
      reviewError: error,
      reviewStatusMessage,
      reviewRetryAfterSeconds: null
    })),
    on(ReviewDataActions.generateReview, (state) => ({
      ...state,
      reviewLoading: true,
      reviewError: null,
      reviewStatusMessage: 'Generating review.',
      reviewRetryAfterSeconds: null
    })),
    on(ReviewDataActions.generateReviewSuccess, (state, { reviewText, reviewMeta, reviewStatusMessage }) => ({
      ...state,
      reviewLoading: false,
      reviewError: null,
      reviewText,
      reviewMeta,
      reviewStatusMessage,
      reviewRetryAfterSeconds: null
    })),
    on(ReviewDataActions.generateReviewFailure, (state, { error, reviewStatusMessage, retryAfterSeconds }) => ({
      ...state,
      reviewLoading: false,
      reviewError: error,
      reviewStatusMessage,
      reviewRetryAfterSeconds: retryAfterSeconds ?? null
    }))
  )
});
