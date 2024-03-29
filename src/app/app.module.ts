import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { NavbarComponent } from './components/navbar/navbar.component';
import { ThumbnailSectionComponent } from './components/thumbnail-section/thumbnail-section.component';
import { TitleLogoComponent } from './components/title-logo/title-logo.component';
import { AboutComponent } from './pages/about/about.component';
import { ContactComponent } from './pages/contact/contact.component';
import { ErrorNotFoundComponent } from './pages/error-not-found/error-not-found.component';
import { GalleryNavbarComponent } from './pages/gallery/gallery-navbar/gallery-navbar.component';
import { GalleryComponent } from './pages/gallery/gallery.component';
import { HomeComponent } from './pages/home/home.component';
import { StudioComponent } from './pages/studio/studio.component';
import { NavbarColorPipe } from './pipes/navbar-color.pipe';

const Components = [
  HomeComponent,
  AboutComponent,
  ErrorNotFoundComponent,
  GalleryComponent,
  TitleLogoComponent,
  ThumbnailSectionComponent,
  GalleryNavbarComponent,
  ContactComponent,
];

@NgModule({
  declarations: [
    AppComponent,
    Components,
    StudioComponent,
    NavbarComponent,
    NavbarColorPipe,
  ],
  exports: [Components],
  imports: [
    BrowserModule,
    HttpClientModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
