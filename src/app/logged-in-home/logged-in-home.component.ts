import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RecentReviewItem } from '../models/recent-reviews.models';
import { ReviewWiseApiService } from '../services/reviewwise-api.service';

@Component({
  selector: 'app-logged-in-home',
  imports: [CommonModule, RouterLink],
  templateUrl: './logged-in-home.component.html',
  styleUrl: './logged-in-home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoggedInHomeComponent implements OnInit {
  private readonly api = inject(ReviewWiseApiService);

  readonly loadingRecentReviews = signal(true);
  readonly recentReviewsError = signal<string | null>(null);
  readonly recentReviews = signal<RecentReviewItem[]>([]);
  readonly hasRecentReviews = computed(() => this.recentReviews().length > 0);

  ngOnInit(): void {
    this.api.getRecentReviews(5).subscribe({
      next: (response) => {
        this.recentReviews.set(response.reviews ?? []);
        this.loadingRecentReviews.set(false);
      },
      error: () => {
        this.recentReviewsError.set('Could not load recent reviews.');
        this.loadingRecentReviews.set(false);
      }
    });
  }
}
