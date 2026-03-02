export interface RecentReviewItem {
  owner: string;
  repo: string;
  prNumber: number;
  createdAt: string;
  username: string;
}

export interface RecentReviewsResponse {
  reviews: RecentReviewItem[];
}
