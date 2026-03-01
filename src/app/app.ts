
import { Component, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { environment } from '../environments/environment';
import { ReviewWiseApiService } from './services/reviewwise-api.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly api = inject(ReviewWiseApiService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);

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
  private readonly maxOAuthAuthRetries = 8;

  private isPublicRootUrl(url: string): boolean {
    return url === '/' || url.startsWith('/?') || url.startsWith('/#');
  }

  private finalizeAuthState(user: { authenticated?: boolean; username?: string | null; provider?: string | null }) {
    const authenticated = user?.authenticated === true;
    const currentUrl = this.router.url;

    this.isAuthenticated.set(authenticated);
    this.authUsername.set(authenticated ? user?.username ?? null : null);
    this.authProvider.set(authenticated ? user?.provider ?? null : null);
    this.authChecked.set(true);

    if (authenticated && isPlatformBrowser(this.platformId) && this.isPublicRootUrl(currentUrl)) {
      this.router.navigateByUrl('/home', { replaceUrl: true });
    } else if (!authenticated && isPlatformBrowser(this.platformId) && !this.isPublicRootUrl(currentUrl)) {
      this.router.navigateByUrl('/');
    }
  }

  private runAuthCheck(isOAuthReturn: boolean, attempt: number = 0) {
    this.api.getAuthUser().subscribe({
      next: (user: { authenticated?: boolean; username?: string | null; provider?: string | null }) => {
        const authenticated = user?.authenticated === true;
        if (!authenticated && isOAuthReturn && attempt < this.maxOAuthAuthRetries) {
          setTimeout(() => this.runAuthCheck(true, attempt + 1), 300);
          return;
        }

        this.finalizeAuthState(user);
      },
      error: () => {
        if (isOAuthReturn && attempt < this.maxOAuthAuthRetries) {
          setTimeout(() => this.runAuthCheck(true, attempt + 1), 300);
          return;
        }

        this.isAuthenticated.set(false);
        this.authUsername.set(null);
        this.authProvider.set(null);
        this.authChecked.set(true);

        if (isPlatformBrowser(this.platformId) && this.router.url !== '/') {
          this.router.navigateByUrl('/');
        }
      }
    });
  }

  constructor() {
    let oauthReturn = false;

    if (isPlatformBrowser(this.platformId)) {
      const searchParams = new URLSearchParams(window.location.search);
      const authError = searchParams.get('authError');
      oauthReturn = searchParams.get('oauth') === '1';
      this.authError.set(authError);

      if (authError || oauthReturn) {
        searchParams.delete('authError');
        searchParams.delete('oauth');
        const newSearch = searchParams.toString();
        const nextUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', nextUrl);
      }
    }

    this.runAuthCheck(oauthReturn);
  }

  protected dismissAuthError() {
    this.authError.set(null);
  }

  protected loginWithGitHub() {
    if (isPlatformBrowser(this.platformId)) {
      window.location.assign(this.githubLoginUrl);
    }
  }

  protected loginWithGitLab() {
    if (isPlatformBrowser(this.platformId)) {
      window.location.assign(this.gitlabLoginUrl);
    }
  }
}
