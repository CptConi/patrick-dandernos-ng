import { animate, style, transition, trigger } from '@angular/animations';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
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
  public firstOpen = true;

  @Input() active: string = '';
  @Output() isDisplayed = new EventEmitter<boolean>();

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

  constructor(private router: Router) {}

  ngOnInit(): void {}

  public displayNavBarAction(isDisplayed: boolean) {
    this.isDisplayed.emit(isDisplayed);
    this.isNavBarDisplayed = isDisplayed;
  }

  public toHome() {
    this.resetCssBackgroundStyle();
    this.router.navigate(['/home']);
  }

  private resetCssBackgroundStyle() {
    const bg = document.querySelector('body');
    if (bg) {
      bg.style.color = '#FFF';
      bg.style.backgroundColor = '#000';
      bg.style.backgroundImage =
        'linear-gradient(90deg, black 20%, #0d0d0f 100%)';
    }
  }
}
