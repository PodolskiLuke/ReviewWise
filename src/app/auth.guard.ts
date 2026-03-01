import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ReviewWiseApiService } from './services/reviewwise-api.service';

export const authGuard: CanActivateFn = () => {
  const api = inject(ReviewWiseApiService);
  const router = inject(Router);

  return api.getAuthUser().pipe(
    map((user: { authenticated?: boolean } | null | undefined) => {
      if (user?.authenticated === true) {
        return true;
      }

      return router.createUrlTree(['/']);
    }),
    catchError(() => of(router.createUrlTree(['/'])))
  );
};
