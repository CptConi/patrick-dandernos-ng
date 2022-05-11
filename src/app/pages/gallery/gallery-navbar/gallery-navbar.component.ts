import { Component, Input, OnInit } from '@angular/core';
import { sectionInfosByCategory } from 'src/app/enum/section-infos-by-category';

@Component({
  selector: 'app-gallery-navbar',
  templateUrl: './gallery-navbar.component.html',
  styleUrls: ['./gallery-navbar.component.scss'],
})
export class GalleryNavbarComponent implements OnInit {
  public sectionInfosByCategory = sectionInfosByCategory;
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

  ngOnInit(): void {
    console.log(this.active);
  }
}
