import { Component, EventEmitter, Input, Output } from '@angular/core';
import { take } from 'rxjs/operators';
import { sectionInfosByCategory } from 'src/app/enum/section-infos-by-category';
import { LandingPageSection } from 'src/app/models/landing-page-section.model';
import { HttpService } from 'src/app/services/http.service';

@Component({
  selector: 'app-thumbnail-section',
  templateUrl: './thumbnail-section.component.html',
  styleUrls: ['./thumbnail-section.component.scss'],
})
export class ThumbnailSectionComponent {
  @Input() landingPageSection: LandingPageSection;
  @Input() screenSize!: string;
  @Input() active = false;

  @Output() activeCategory = new EventEmitter<string>();

  public get smallDevice(): boolean {
    return this.screenSize === 'XSmall' || this.screenSize === 'Small';
  }

  public get sectionTitle(): string {
    // @ts-ignore
    return sectionInfosByCategory.get(this.landingPageSection.category)?.name;
  }
  public get sectionDescription(): string {
    // @ts-ignore
    return sectionInfosByCategory.get(this.landingPageSection.category)
      ?.description;
  }
  public get sectionIcon(): string {
    // @ts-ignore
    return sectionInfosByCategory.get(this.landingPageSection.category)?.icon;
  }
  public get sectionURL(): string {
    // @ts-ignore
    return sectionInfosByCategory.get(this.landingPageSection.category)
      ?.urlLink;
  }
  public get sectionFont(): any {
    // @ts-ignore
    return sectionInfosByCategory.get(this.landingPageSection.category)?.font;
  }

  constructor(private httpService: HttpService) {}

  public testAPI() {
    this.httpService
      .getGalleryFromCategory(this.landingPageSection.category)
      .pipe(take(1))
      .subscribe(() => {});
  }

  public setActiveCategory() {
    if (!this.smallDevice) {
      return;
    }
    this.activeCategory.emit(this.landingPageSection.category);
  }

  public toGallery(event: MouseEvent) {
    if (this.smallDevice) {
      this.activeCategory.emit(this.landingPageSection.category);
    }
    console.log('going to ' + this.landingPageSection.category);
  }
}
