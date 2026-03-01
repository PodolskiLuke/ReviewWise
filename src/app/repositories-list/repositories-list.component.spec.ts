import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { RepositoriesListComponent } from './repositories-list.component';
import { ReviewWiseApiService } from '../services/reviewwise-api.service';

describe('RepositoriesListComponent', () => {
  let fixture: ComponentFixture<RepositoriesListComponent>;
  let component: RepositoriesListComponent;
  let apiServiceSpy: jasmine.SpyObj<ReviewWiseApiService>;

  beforeEach(async () => {
    apiServiceSpy = jasmine.createSpyObj<ReviewWiseApiService>('ReviewWiseApiService', ['getRepositories']);

    await TestBed.configureTestingModule({
      imports: [RepositoriesListComponent],
      providers: [{ provide: ReviewWiseApiService, useValue: apiServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(RepositoriesListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    apiServiceSpy.getRepositories.and.returnValue(of([]));
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should load repositories on init', fakeAsync(() => {
    const repositories = [
      { id: 1, name: 'ReviewWise' },
      { id: 2, name: 'AnotherRepo' },
    ];
    apiServiceSpy.getRepositories.and.returnValue(of(repositories));

    fixture.detectChanges();
    tick();

    expect(apiServiceSpy.getRepositories).toHaveBeenCalled();
    expect(component.loading).toBeFalse();
    expect(component.error).toBeNull();
    expect(component.repositories).toEqual(repositories);
    expect(component.filteredRepositories).toEqual(repositories);
  }));

  it('should set error when repositories request fails', fakeAsync(() => {
    apiServiceSpy.getRepositories.and.returnValue(
      throwError(() => new Error('network failure'))
    );

    fixture.detectChanges();
    tick();

    expect(component.loading).toBeFalse();
    expect(component.error).toBe('Failed to load repositories.');
    expect(component.repositories).toEqual([]);
  }));

  it('should prompt login when repositories request is unauthorized', fakeAsync(() => {
    apiServiceSpy.getRepositories.and.returnValue(
      throwError(() => ({ status: 401 }))
    );

    fixture.detectChanges();
    tick();

    expect(component.loading).toBeFalse();
    expect(component.error).toBe('Please log in to view repositories.');
  }));

  it('should filter repositories by search term', () => {
    component.repositories = [
      { id: 1, name: 'ReviewWise' },
      { id: 2, name: 'api-service' },
      { id: 3, name: 'frontend' },
    ];

    component.onSearch('REVIEW');

    expect(component.searchTerm).toBe('REVIEW');
    expect(component.filteredRepositories).toEqual([{ id: 1, name: 'ReviewWise' }]);
  });

  it('should set selected repository', () => {
    const repository = { id: 10, name: 'selected-repo' };

    component.selectRepo(repository);

    expect(component.selectedRepo).toEqual(repository);
  });
});
