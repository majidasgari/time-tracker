import { Routes } from '@angular/router';
import { OverviewComponent } from './pages/overview/overview.component';
import { ChartsComponent } from './pages/charts/charts.component';
import { TimelineComponent } from './pages/timeline/timeline.component';
import { CategoriesComponent } from './pages/categories/categories.component';
import { ScreenshotsComponent } from './pages/screenshots/screenshots.component';
import { SettingsComponent } from './pages/settings/settings.component';

export const routes: Routes = [
  { path: '', redirectTo: '/overview', pathMatch: 'full' },
  { path: 'overview',   component: OverviewComponent },
  { path: 'charts',     component: ChartsComponent },
  { path: 'timeline',   component: TimelineComponent },
  { path: 'categories', component: CategoriesComponent },
  { path: 'screenshots', component: ScreenshotsComponent },
  { path: 'settings',   component: SettingsComponent },
];
