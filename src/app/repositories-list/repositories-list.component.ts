import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { ReviewWiseApiService } from '../services/reviewwise-api.service';
import * as ReviewDataActions from '../state/review-data/review-data.actions';
import {
  selectPullRequests,
  selectPullRequestsError,
  selectPullRequestsLoading,
  selectRepositories,
  selectRepositoriesError,
  selectRepositoriesLoading,
  selectSelectedRepository
} from '../state/review-data/review-data.selectors';

@Component({
  selector: 'app-repositories-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './repositories-list.component.html',
  styleUrls: ['./repositories-list.component.scss']
})
export class RepositoriesListComponent implements OnInit {
  @ViewChild('reviewPanel') reviewPanel?: ElementRef<HTMLElement>;
  private readonly destroyRef = inject(DestroyRef);

  repositories: any[] = [];
  filteredRepositories: any[] = [];
  selectedRepo: any = null;
  pullRequests: any[] = [];
  pullRequestsLoading = false;
  pullRequestsError: string | null = null;
  selectedPullRequest: any = null;
  reviewLoading = false;
  reviewError: string | null = null;
  reviewText: string | null = null;
  reviewMeta: string | null = null;
  reviewStatusMessage: string | null = null;
  searchTerm: string = '';
  loading = false;
  error: string | null = null;
  private pullRequestsRequestId = 0;
  private pullRequestsStartedAt: number | null = null;
  pullRequestsElapsedSeconds = 0;
  private pullRequestsHeartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(private api: ReviewWiseApiService, private store: Store) {}

  ngOnInit() {
    this.bindStoreState();
    this.store.dispatch(ReviewDataActions.loadRepositories());
  }

  onSearch(term: string) {
    this.searchTerm = term;
    this.applySearchFilter();
  }

  selectRepo(repo: any) {
    this.selectedRepo = repo;
    this.selectedPullRequest = null;
    this.pullRequests = [];
    this.pullRequestsLoading = false;
    this.pullRequestsError = null;
    this.reviewError = null;
    this.reviewText = null;
    this.reviewMeta = null;
    this.reviewStatusMessage = null;

    this.store.dispatch(ReviewDataActions.selectRepository({ repository: repo }));

    const owner = this.getRepoOwner(repo);
    const repoName = this.getRepoName(repo);
    if (!owner || !repoName) {
      return;
    }

    this.pullRequestsRequestId += 1;
    this.store.dispatch(ReviewDataActions.loadPullRequests({ owner, repo: repoName }));
  }

  selectPullRequest(pr: any) {
    this.selectedPullRequest = pr;
    this.reviewError = null;
    this.reviewText = null;
    this.reviewMeta = null;
    this.reviewStatusMessage = 'Loading latest review for selected pull request.';
    this.fetchLatestReview();
  }

  viewLatestReview() {
    this.fetchLatestReview();
  }

  generateReview() {
    if (!this.selectedRepo || !this.selectedPullRequest) {
      return;
    }

    const owner = this.getRepoOwner(this.selectedRepo);
    const repoName = this.getRepoName(this.selectedRepo);
    const prNumber = this.getPrNumber(this.selectedPullRequest);

    if (!owner || !repoName || !prNumber) {
      this.reviewError = 'Could not determine repository or pull request details.';
      return;
    }

    this.reviewLoading = true;
    this.reviewError = null;
    this.reviewStatusMessage = 'Generating review.';
    this.focusReviewPanel();

    this.api.triggerReview(owner, repoName, prNumber).subscribe({
      next: (response: { review?: string }) => {
        this.reviewText = response?.review ?? 'Review generated, but no text was returned.';
        this.reviewMeta = 'Generated just now';
        this.reviewLoading = false;
        this.reviewStatusMessage = 'Review generated and displayed.';
      },
      error: (err: HttpErrorResponse) => {
        this.reviewError = err.status === 401 || err.status === 403
          ? 'Please log in to generate a review.'
          : 'Failed to generate review.';
        this.reviewLoading = false;
        this.reviewStatusMessage = 'Review generation failed.';
      }
    });
  }

  private bindStoreState() {
    this.store.select(selectRepositories)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((repositories) => {
        this.repositories = repositories;
        this.applySearchFilter();
      });

    this.store.select(selectRepositoriesLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((loading) => {
        this.loading = loading;
      });

    this.store.select(selectRepositoriesError)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((error) => {
        this.error = error;
      });

    this.store.select(selectSelectedRepository)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((repository) => {
        this.selectedRepo = repository;
      });

    this.store.select(selectPullRequests)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((pullRequests) => {
        this.pullRequests = pullRequests;
      });

    this.store.select(selectPullRequestsError)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((error) => {
        this.pullRequestsError = error;
      });

    this.store.select(selectPullRequestsLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((loading) => {
        this.pullRequestsLoading = loading;

        if (loading) {
          this.startPullRequestElapsedTimer();
        } else {
          this.stopPullRequestElapsedTimer();
        }
      });
  }

  private applySearchFilter() {
    const term = this.searchTerm.toLowerCase().trim();
    this.filteredRepositories = this.repositories.filter(repo =>
      (repo?.name ?? '').toLowerCase().includes(term)
    );
  }

  private startPullRequestElapsedTimer() {
    this.stopPullRequestElapsedTimer();
    this.pullRequestsStartedAt = Date.now();
    this.pullRequestsElapsedSeconds = 0;
    this.pullRequestsHeartbeat = setInterval(() => {
      if (!this.pullRequestsStartedAt) {
        return;
      }

      this.pullRequestsElapsedSeconds = Math.floor((Date.now() - this.pullRequestsStartedAt) / 1000);
    }, 1000);
  }

  private stopPullRequestElapsedTimer() {
    if (this.pullRequestsHeartbeat) {
      clearInterval(this.pullRequestsHeartbeat);
      this.pullRequestsHeartbeat = null;
    }

    this.pullRequestsStartedAt = null;
  }

  private fetchLatestReview() {
    if (!this.selectedRepo || !this.selectedPullRequest) {
      return;
    }

    const owner = this.getRepoOwner(this.selectedRepo);
    const repoName = this.getRepoName(this.selectedRepo);
    const prNumber = this.getPrNumber(this.selectedPullRequest);

    if (!owner || !repoName || !prNumber) {
      this.reviewError = 'Could not determine repository or pull request details.';
      return;
    }

    this.reviewLoading = true;
    this.reviewError = null;
    this.reviewStatusMessage = 'Loading latest review.';
    this.focusReviewPanel();

    this.api.getReviewResult(owner, repoName, prNumber).subscribe({
      next: (response: { review?: string; createdAt?: string; username?: string }) => {
        this.reviewText = response?.review ?? null;
        if (response?.createdAt || response?.username) {
          const created = response.createdAt ? new Date(response.createdAt).toLocaleString() : null;
          const user = response.username ? ` by ${response.username}` : '';
          this.reviewMeta = created ? `Latest saved review: ${created}${user}` : `Latest saved review${user}`;
        } else {
          this.reviewMeta = null;
        }
        this.reviewLoading = false;
        this.reviewStatusMessage = this.reviewText
          ? 'Latest review loaded and displayed.'
          : 'No latest review content was found.';
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          this.reviewStatusMessage = 'No saved review exists for this pull request yet.';
        } else {
          this.reviewError = err.status === 401 || err.status === 403
            ? 'Please log in to view review results.'
            : 'Failed to load review result.';
          this.reviewStatusMessage = 'Loading latest review failed.';
        }
        this.reviewLoading = false;
      }
    });
  }

  getPrLabel(pr: any): string {
    const number = this.getPrNumber(pr);
    const title = pr?.title ?? 'Untitled pull request';
    return number ? `#${number} ${title}` : title;
  }

  getRepoTrackKey(repo: any): string | number {
    return repo?.id ?? repo?.path_with_namespace ?? repo?.name ?? 'unknown-repo';
  }

  getPrTrackKey(pr: any): string | number {
    const number = this.getPrNumber(pr);
    return number ?? pr?.id ?? pr?.iid ?? pr?.title ?? 'unknown-pr';
  }

  isRepoSelected(repo: any): boolean {
    return !!this.selectedRepo && this.getRepoTrackKey(this.selectedRepo) === this.getRepoTrackKey(repo);
  }

  isPrSelected(pr: any): boolean {
    return !!this.selectedPullRequest && this.getPrTrackKey(this.selectedPullRequest) === this.getPrTrackKey(pr);
  }

  getPullRequestDebugState(): string {
    return `loading=${this.pullRequestsLoading} requestId=${this.pullRequestsRequestId} elapsed=${this.pullRequestsElapsedSeconds}s count=${this.pullRequests.length} error=${this.pullRequestsError ?? 'none'}`;
  }

  private getRepoOwner(repo: any): string | null {
    if (repo?.owner?.login) {
      return repo.owner.login;
    }

    if (repo?.path_with_namespace && typeof repo.path_with_namespace === 'string') {
      const parts = repo.path_with_namespace.split('/');
      return parts.length > 1 ? parts[0] : null;
    }

    return null;
  }

  private getRepoName(repo: any): string | null {
    if (repo?.name) {
      return repo.name;
    }

    if (repo?.path_with_namespace && typeof repo.path_with_namespace === 'string') {
      const parts = repo.path_with_namespace.split('/');
      return parts.length > 1 ? parts.slice(1).join('/') : parts[0] ?? null;
    }

    return null;
  }

  private getPrNumber(pr: any): number | null {
    if (typeof pr?.number === 'number') {
      return pr.number;
    }

    if (typeof pr?.iid === 'number') {
      return pr.iid;
    }

    return null;
  }

  private focusReviewPanel() {
    setTimeout(() => {
      const panel = this.reviewPanel?.nativeElement;
      if (!panel) {
        return;
      }

      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      panel.focus();
    }, 0);
  }
}
