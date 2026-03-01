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
}

const initialState: ReviewDataState = {
  repositories: [],
  repositoriesLoading: false,
  repositoriesError: null,
  selectedRepository: null,
  pullRequests: [],
  pullRequestsLoading: false,
  pullRequestsError: null
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
      pullRequestsError: null
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
    }))
  )
});
