import { TestBed } from '@angular/core/testing';
import { UrlTree } from '@angular/router';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom, isObservable, of, throwError } from 'rxjs';
import { authGuard } from './auth.guard';
import { ReviewWiseApiService } from './services/reviewwise-api.service';

describe('authGuard', () => {
  let apiServiceSpy: jasmine.SpyObj<ReviewWiseApiService>;
  let router: Router;

  const runGuard = () =>
    TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));

  const resolveGuardResult = async () => {
    const result = runGuard();
    if (isObservable(result)) {
      return firstValueFrom(result);
    }

    return Promise.resolve(result);
  };

  beforeEach(() => {
    apiServiceSpy = jasmine.createSpyObj<ReviewWiseApiService>('ReviewWiseApiService', ['getAuthUser']);

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ReviewWiseApiService, useValue: apiServiceSpy }],
    });

    router = TestBed.inject(Router);
  });

  it('should allow navigation when user is authenticated', async () => {
    apiServiceSpy.getAuthUser.and.returnValue(of({ authenticated: true }));

    const result = await resolveGuardResult();

    expect(result).toBeTrue();
  });

  it('should redirect to public homepage when user is unauthenticated', async () => {
    apiServiceSpy.getAuthUser.and.returnValue(of({ authenticated: false }));

    const result = await resolveGuardResult();

    expect(result instanceof UrlTree).toBeTrue();
    expect(router.serializeUrl(result as UrlTree)).toBe('/');
  });

  it('should redirect to public homepage when auth check fails', async () => {
    apiServiceSpy.getAuthUser.and.returnValue(throwError(() => new Error('auth check failed')));

    const result = await resolveGuardResult();

    expect(result instanceof UrlTree).toBeTrue();
    expect(router.serializeUrl(result as UrlTree)).toBe('/');
  });
});
