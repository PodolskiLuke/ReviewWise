import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

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
    return this.http.get(`${this.api}/api/repositories/${owner}/${repo}/pull-requests`, { withCredentials: true });
  }

  getReviewResult(owner: string, repo: string, prNumber: number): Observable<any> {
    return this.http.get(`${this.api}/api/repositories/${owner}/${repo}/pull-requests/${prNumber}/review`, { withCredentials: true });
  }

  triggerReview(owner: string, repo: string, prNumber: number): Observable<any> {
    return this.http.post(`${this.api}/api/repositories/${owner}/${repo}/pull-requests/${prNumber}/review`, {}, { withCredentials: true });
  }
}
