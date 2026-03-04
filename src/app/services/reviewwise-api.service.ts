import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';
import { UpdateUserSettingsRequest, UserSettingsDocument, UserSettingsResponse } from '../models/user-settings.models';
import { RecentReviewsResponse } from '../models/recent-reviews.models';

@Injectable({ providedIn: 'root' })
export class ReviewWiseApiService {
  private api = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getRepositories(): Observable<any> {
    return this.http.get(`${this.api}/api/repositories`, { withCredentials: true });
  }

  getAuthUser(): Observable<any> {
    return this.http.get(`${this.api}/api/auth/users`, { withCredentials: true });
  }

  getPullRequests(owner: string, repo: string): Observable<any> {
    return this.http.get(`${this.api}/api/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pull-requests`, { withCredentials: true });
  }

  getPullRequestFiles(owner: string, repo: string, prNumber: number): Observable<any> {
    return this.http.get(`${this.api}/api/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pull-requests/${prNumber}/files`, { withCredentials: true });
  }

  getPullRequestComparison(owner: string, repo: string, prNumber: number): Observable<any> {
    return this.http.get(`${this.api}/api/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pull-requests/${prNumber}/comparison`, { withCredentials: true });
  }

  getPullRequestFileContent(owner: string, repo: string, prNumber: number, params: {
    path: string;
    oldPath?: string | null;
    newPath?: string | null;
    status?: string | null;
  }): Observable<any> {
    const query = new URLSearchParams();
    query.set('path', params.path);
    if (params.oldPath) {
      query.set('oldPath', params.oldPath);
    }
    if (params.newPath) {
      query.set('newPath', params.newPath);
    }
    if (params.status) {
      query.set('status', params.status);
    }

    return this.http.get(
      `${this.api}/api/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pull-requests/${prNumber}/file-content?${query.toString()}`,
      { withCredentials: true }
    );
  }

  getReviewResult(owner: string, repo: string, prNumber: number): Observable<any> {
    return this.http.get(`${this.api}/api/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pull-requests/${prNumber}/review`, { withCredentials: true });
  }

  getRecentReviews(limit = 5): Observable<RecentReviewsResponse> {
    return this.http.get<RecentReviewsResponse>(`${this.api}/api/reviews/recent?limit=${limit}`, { withCredentials: true });
  }

  triggerReview(owner: string, repo: string, prNumber: number): Observable<any> {
    return this.http.post(`${this.api}/api/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pull-requests/${prNumber}/review`, {}, { withCredentials: true });
  }

  getUserSettings(): Observable<UserSettingsResponse> {
    return this.http.get<UserSettingsResponse>(`${this.api}/api/user-settings`, { withCredentials: true });
  }

  updateUserSettings(settings: UserSettingsDocument): Observable<UserSettingsResponse> {
    const payload: UpdateUserSettingsRequest = { settings };
    return this.http.put<UserSettingsResponse>(`${this.api}/api/user-settings`, payload, { withCredentials: true });
  }
}
