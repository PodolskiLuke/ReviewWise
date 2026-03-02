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
