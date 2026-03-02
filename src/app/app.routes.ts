import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { LoggedInHomeComponent } from './logged-in-home/logged-in-home.component';
import { RepositoriesListComponent } from './repositories-list/repositories-list.component';
import { UserSettingsComponent } from './user-settings/user-settings.component';

export const routes: Routes = [
	{ path: '', component: LoggedInHomeComponent },
	{ path: 'home', component: LoggedInHomeComponent },
	{ path: 'repositories', component: RepositoriesListComponent, canActivate: [authGuard] },
	{ path: 'settings', component: UserSettingsComponent, canActivate: [authGuard] }
];
