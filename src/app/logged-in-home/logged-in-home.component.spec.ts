import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ReviewWiseApiService } from '../services/reviewwise-api.service';
import { LoggedInHomeComponent } from './logged-in-home.component';

describe('LoggedInHomeComponent', () => {
  let fixture: ComponentFixture<LoggedInHomeComponent>;
  let component: LoggedInHomeComponent;
  let apiSpy: jasmine.SpyObj<ReviewWiseApiService>;

  beforeEach(async () => {
    apiSpy = jasmine.createSpyObj<ReviewWiseApiService>('ReviewWiseApiService', ['getRecentReviews']);

    await TestBed.configureTestingModule({
      imports: [LoggedInHomeComponent],
      providers: [
        provideRouter([]),
        { provide: ReviewWiseApiService, useValue: apiSpy }
      ]
    }).compileComponents();
  });

  it('should render recent reviews when API returns data', () => {
    apiSpy.getRecentReviews.and.returnValue(of({
      reviews: [
        {
          owner: 'PodolskiLuke',
          repo: 'ReviewWise',
          prNumber: 101,
          createdAt: new Date().toISOString(),
          username: 'ci-user'
        }
      ]
    }));

    fixture = TestBed.createComponent(LoggedInHomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.hasRecentReviews()).toBeTrue();
    expect(apiSpy.getRecentReviews).toHaveBeenCalledWith(5);
    expect(fixture.nativeElement.textContent).toContain('Recent reviews');
    expect(fixture.nativeElement.textContent).toContain('PodolskiLuke/ReviewWise #101');
  });

  it('should show an error message when API request fails', () => {
    apiSpy.getRecentReviews.and.returnValue(throwError(() => new Error('boom')));

    fixture = TestBed.createComponent(LoggedInHomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.recentReviewsError()).toBe('Could not load recent reviews.');
    expect(component.loadingRecentReviews()).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Could not load recent reviews.');
  });
});
