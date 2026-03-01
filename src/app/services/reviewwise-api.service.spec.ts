import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ReviewWiseApiService } from './reviewwise-api.service';
import { environment } from '../../environments/environment';

describe('ReviewWiseApiService', () => {
  let service: ReviewWiseApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ReviewWiseApiService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(ReviewWiseApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should request repositories', () => {
    service.getRepositories().subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/repositories`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBeTrue();
    req.flush([]);
  });

  it('should request authenticated user', () => {
    service.getAuthUser().subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/auth/users`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBeTrue();
    req.flush({ authenticated: true });
  });

  it('should request pull requests for a repository', () => {
    service.getPullRequests('owner1', 'repo1').subscribe();

    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/api/repositories/owner1/repo1/pull-requests`
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBeTrue();
    req.flush([]);
  });

  it('should request review result for a pull request', () => {
    service.getReviewResult('owner1', 'repo1', 123).subscribe();

    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/api/repositories/owner1/repo1/pull-requests/123/review`
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBeTrue();
    req.flush({ review: 'ok' });
  });

  it('should trigger review generation for a pull request', () => {
    service.triggerReview('owner1', 'repo1', 123).subscribe();

    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/api/repositories/owner1/repo1/pull-requests/123/review`
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.body).toEqual({});
    req.flush({ review: 'generated' });
  });
});
