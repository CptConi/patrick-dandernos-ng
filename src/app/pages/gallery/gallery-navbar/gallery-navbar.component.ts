import { animate, style, transition, trigger } from '@angular/animations';
import { Component, Input, OnInit } from '@angular/core';
import { sectionInfosByCategory } from 'src/app/enum/section-infos-by-category';

@Component({
  selector: 'app-gallery-navbar',
  templateUrl: './gallery-navbar.component.html',
  styleUrls: ['./gallery-navbar.component.scss'],
  animations: [
    trigger('inOutAnimation', [
      transition(':enter', [
        style({ height: 0, opacity: 0 }),
        animate('0.4s ease-out', style({ height: 122, opacity: 1 })),
      ]),
      transition(':leave', [
        style({ height: 122, opacity: 1 }),
        animate('0.4s ease-out', style({ height: 0, opacity: 0 })),
      ]),
    ]),
  ],
})
export class GalleryNavbarComponent implements OnInit {
  public sectionInfosByCategory = sectionInfosByCategory;
  public isNavBarDisplayed = true;
  @Input() active: string = '';

  public get sectionTitle(): string {
    // @ts-ignore
    return sectionInfosByCategory.get(this.active)?.name;
  }
  public get sectionIcon(): string {
    // @ts-ignore
    return sectionInfosByCategory.get(this.active)?.icon;
  }
  public get sectionFont(): any {
    // @ts-ignore
    return sectionInfosByCategory.get(this.active)?.font;
  }

  constructor() {}

  ngOnInit(): void {}

  public displayNavBarAction(isDisplayed: boolean) {
    this.isNavBarDisplayed = isDisplayed;
  }
}
