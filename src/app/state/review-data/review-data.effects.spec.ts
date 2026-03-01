import { TestBed } from '@angular/core/testing';
import { Actions } from '@ngrx/effects';
import { Action } from '@ngrx/store';
import { ReplaySubject, firstValueFrom, of, throwError } from 'rxjs';
import { ReviewWiseApiService } from '../../services/reviewwise-api.service';
import { ReviewDataEffects } from './review-data.effects';
import * as ReviewDataActions from './review-data.actions';

describe('ReviewDataEffects', () => {
  let actions$: ReplaySubject<Action>;
  let effects: ReviewDataEffects;
  let apiServiceSpy: jasmine.SpyObj<ReviewWiseApiService>;

  beforeEach(() => {
    actions$ = new ReplaySubject<Action>(1);
    apiServiceSpy = jasmine.createSpyObj<ReviewWiseApiService>('ReviewWiseApiService', [
      'getRepositories',
      'getPullRequests'
    ]);

    TestBed.configureTestingModule({
      providers: [
        ReviewDataEffects,
        { provide: ReviewWiseApiService, useValue: apiServiceSpy },
        { provide: Actions, useFactory: () => new Actions(actions$) }
      ]
    });

    effects = TestBed.inject(ReviewDataEffects);
  });

  it('should create effects instance', () => {
    expect(effects).toBeTruthy();
  });

  it('should emit loadRepositoriesSuccess when repositories API succeeds', async () => {
    const repositories = [{ id: 1, name: 'ReviewWise' }];
    apiServiceSpy.getRepositories.and.returnValue(of(repositories));

    const resultPromise = firstValueFrom(effects.loadRepositories$);
    actions$.next(ReviewDataActions.loadRepositories());

    const result = await resultPromise;

    expect(result).toEqual(ReviewDataActions.loadRepositoriesSuccess({ repositories }));
  });

  it('should emit loadPullRequestsFailure when pull requests API is unauthorized', async () => {
    apiServiceSpy.getPullRequests.and.returnValue(throwError(() => ({ status: 401 })));

    const resultPromise = firstValueFrom(effects.loadPullRequests$);
    actions$.next(ReviewDataActions.loadPullRequests({ owner: 'owner1', repo: 'repo1' }));

    const result = await resultPromise;

    expect(result).toEqual(
      ReviewDataActions.loadPullRequestsFailure({
        error: 'Please log in to view pull requests.'
      })
    );
  });
});
