
import { Component, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { environment } from '../environments/environment';
import { ReviewWiseApiService } from './services/reviewwise-api.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly api = inject(ReviewWiseApiService);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly title = signal('idea');
  protected readonly environment = environment;
  protected readonly githubLoginUrl = `${environment.apiBaseUrl}/login`;
  protected readonly gitlabLoginUrl = `${environment.apiBaseUrl}/login-gitlab`;
  protected readonly logoutUrl = `${environment.apiBaseUrl}/logout`;
  protected readonly isAuthenticated = signal(false);
  protected readonly authChecked = signal(false);
  protected readonly authUsername = signal<string | null>(null);
  protected readonly authProvider = signal<string | null>(null);
  protected readonly authError = signal<string | null>(null);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const searchParams = new URLSearchParams(window.location.search);
      const authError = searchParams.get('authError');
      this.authError.set(authError);

      if (authError) {
        searchParams.delete('authError');
        const newSearch = searchParams.toString();
        const nextUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', nextUrl);
      }
    }

    this.api.getAuthUser().subscribe({
      next: (user: { authenticated?: boolean; username?: string | null; provider?: string | null }) => {
        const authenticated = user?.authenticated === true;
        this.isAuthenticated.set(authenticated);
        this.authUsername.set(authenticated ? user?.username ?? null : null);
        this.authProvider.set(authenticated ? user?.provider ?? null : null);
        this.authChecked.set(true);
      },
      error: () => {
        this.isAuthenticated.set(false);
        this.authUsername.set(null);
        this.authProvider.set(null);
        this.authChecked.set(true);
      }
    });
  }

  protected dismissAuthError() {
    this.authError.set(null);
  }
}
