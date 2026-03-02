import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import * as ReviewDataActions from '../state/review-data/review-data.actions';
import {
  selectPullRequests,
  selectPullRequestsError,
  selectPullRequestsLoading,
  selectReviewError,
  selectReviewLoading,
  selectReviewMeta,
  selectReviewRetryAfterSeconds,
  selectReviewStatusMessage,
  selectReviewText,
  selectRepositories,
  selectRepositoriesError,
  selectRepositoriesLoading,
  selectSelectedPullRequest,
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
  reviewRetryAfterSeconds: number | null = null;
  reviewRetryCountdown = 0;
  searchTerm: string = '';
  loading = false;
  error: string | null = null;
  private retryCountdownIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(private store: Store, private changeDetectorRef: ChangeDetectorRef) {
    this.destroyRef.onDestroy(() => this.clearRetryCountdownInterval());
  }

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

    this.store.dispatch(ReviewDataActions.loadPullRequests({ owner, repo: repoName }));
  }

  selectPullRequest(pr: any) {
    this.store.dispatch(ReviewDataActions.selectPullRequest({ pullRequest: pr }));
    this.dispatchLoadLatestReview(pr);
  }

  viewLatestReview() {
    this.dispatchLoadLatestReview(this.selectedPullRequest);
  }

  generateReview() {
    if (!this.selectedRepo || !this.selectedPullRequest || this.isGenerateButtonDisabled) {
      return;
    }

    const owner = this.getRepoOwner(this.selectedRepo);
    const repoName = this.getRepoName(this.selectedRepo);
    const prNumber = this.getPrNumber(this.selectedPullRequest);

    if (!owner || !repoName || !prNumber) {
      this.reviewError = 'Could not determine repository or pull request details.';
      return;
    }

    this.store.dispatch(ReviewDataActions.generateReview({ owner, repo: repoName, prNumber }));
    this.focusReviewPanel();
  }

  get isGenerateButtonDisabled(): boolean {
    return this.reviewLoading || this.reviewRetryCountdown > 0;
  }

  get generateButtonLabel(): string {
    if (this.reviewLoading) {
      return 'Generating review…';
    }

    if (this.reviewRetryCountdown > 0) {
      return `Try again in ${this.reviewRetryCountdown}s`;
    }

    return 'Generate review';
  }

  private bindStoreState() {
    this.store.select(selectRepositories)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((repositories) => {
        this.repositories = repositories;
        this.applySearchFilter();
        this.syncView();
      });

    this.store.select(selectRepositoriesLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((loading) => {
        this.loading = loading;
        this.syncView();
      });

    this.store.select(selectRepositoriesError)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((error) => {
        this.error = error;
        this.syncView();
      });

    this.store.select(selectSelectedRepository)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((repository) => {
        this.selectedRepo = repository;
        this.syncView();
      });

    this.store.select(selectSelectedPullRequest)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((pullRequest) => {
        this.selectedPullRequest = pullRequest;
        this.syncView();
      });

    this.store.select(selectPullRequests)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((pullRequests) => {
        this.pullRequests = pullRequests;
        this.syncView();
      });

    this.store.select(selectPullRequestsError)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((error) => {
        this.pullRequestsError = error;
        this.syncView();
      });

    this.store.select(selectPullRequestsLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((loading) => {
        this.pullRequestsLoading = loading;
        this.syncView();
      });

    this.store.select(selectReviewLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((loading) => {
        this.reviewLoading = loading;
        this.syncView();
      });

    this.store.select(selectReviewError)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((error) => {
        this.reviewError = error;
        this.syncView();
      });

    this.store.select(selectReviewText)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((reviewText) => {
        this.reviewText = reviewText;
        this.syncView();
      });

    this.store.select(selectReviewMeta)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((reviewMeta) => {
        this.reviewMeta = reviewMeta;
        this.syncView();
      });

    this.store.select(selectReviewStatusMessage)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((statusMessage) => {
        this.reviewStatusMessage = statusMessage;
        this.syncView();
      });

    this.store.select(selectReviewRetryAfterSeconds)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((retryAfterSeconds) => {
        this.reviewRetryAfterSeconds = retryAfterSeconds;
        this.handleRetryAfterSeconds(retryAfterSeconds);
        this.syncView();
      });
  }

  private syncView() {
    this.changeDetectorRef.detectChanges();
  }

  private handleRetryAfterSeconds(retryAfterSeconds: number | null) {
    if (!retryAfterSeconds || retryAfterSeconds <= 0) {
      this.reviewRetryCountdown = 0;
      this.clearRetryCountdownInterval();
      return;
    }

    this.reviewRetryCountdown = retryAfterSeconds;
    this.clearRetryCountdownInterval();
    this.retryCountdownIntervalId = setInterval(() => {
      if (this.reviewRetryCountdown <= 1) {
        this.reviewRetryCountdown = 0;
        this.clearRetryCountdownInterval();
        return;
      }

      this.reviewRetryCountdown -= 1;
    }, 1000);
  }

  private clearRetryCountdownInterval() {
    if (this.retryCountdownIntervalId) {
      clearInterval(this.retryCountdownIntervalId);
      this.retryCountdownIntervalId = null;
    }
  }

  private applySearchFilter() {
    const term = this.searchTerm.toLowerCase().trim();
    this.filteredRepositories = this.repositories.filter(repo =>
      (repo?.name ?? '').toLowerCase().includes(term)
    );
  }

  private dispatchLoadLatestReview(pullRequest: any) {
    if (!this.selectedRepo || !pullRequest) {
      return;
    }

    const owner = this.getRepoOwner(this.selectedRepo);
    const repoName = this.getRepoName(this.selectedRepo);
    const prNumber = this.getPrNumber(pullRequest);

    if (!owner || !repoName || !prNumber) {
      this.reviewError = 'Could not determine repository or pull request details.';
      return;
    }

    this.store.dispatch(ReviewDataActions.loadLatestReview({ owner, repo: repoName, prNumber }));
    this.focusReviewPanel();
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
