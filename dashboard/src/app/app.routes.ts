import { Routes } from '@angular/router';
import { OverviewComponent } from './pages/overview/overview.component';
import { CategoriesComponent } from './pages/categories/categories.component';
import { ScreenshotsComponent } from './pages/screenshots/screenshots.component';
import { SettingsComponent } from './pages/settings/settings.component';

export const routes: Routes = [
  { path: '', redirectTo: '/overview', pathMatch: 'full' },
  { path: 'overview', component: OverviewComponent },
  { path: 'categories', component: CategoriesComponent },
  { path: 'screenshots', component: ScreenshotsComponent },
  { path: 'settings', component: SettingsComponent },
];
