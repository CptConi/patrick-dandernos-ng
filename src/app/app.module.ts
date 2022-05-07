import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { ThumbnailSectionComponent } from './components/thumbnail-section/thumbnail-section.component';
import { TitleLogoComponent } from './components/title-logo/title-logo.component';
import { AboutComponent } from './pages/about/about.component';
import { ErrorNotFoundComponent } from './pages/error-not-found/error-not-found.component';
import { GalleryComponent } from './pages/gallery/gallery.component';
import { HomeComponent } from './pages/home/home.component';

const Components = [
  HomeComponent,
  AboutComponent,
  ErrorNotFoundComponent,
  GalleryComponent,
  TitleLogoComponent,
  ThumbnailSectionComponent,
];

@NgModule({
  declarations: [AppComponent, Components],
  exports: [Components],
  imports: [
    BrowserModule,
    HttpClientModule,
    AppRoutingModule,
    BrowserAnimationsModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
