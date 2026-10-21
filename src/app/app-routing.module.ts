import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ExperienceComponent } from './pages/experience/experience.component';

/**
 * One immersive page. Every URL (legacy paths included) is served by the same
 * component, which is never remounted: it maps the path to a 3D "station" itself
 * (see models/station-meta.ts) and keeps the URL in sync through `Location`.
 */
const routes: Routes = [
  {
    path: '**',
    component: ExperienceComponent,
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
