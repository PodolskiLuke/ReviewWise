import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideState, provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { environment } from '../environments/environment';
import { reviewDataFeature } from './state/review-data/review-data.reducer';
import { ReviewDataEffects } from './state/review-data/review-data.effects';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    ...(environment.production ? [provideClientHydration(withEventReplay())] : []),
    provideHttpClient(),
    provideStore(),
    provideStoreDevtools({ maxAge: 25, logOnly: environment.production }),
    provideState(reviewDataFeature),
    provideEffects(ReviewDataEffects)
  ]
};
