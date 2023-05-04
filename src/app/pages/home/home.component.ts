import {
  animate,
  query,
  stagger,
  style,
  transition,
  trigger,
} from '@angular/animations';
import { Component, OnInit } from '@angular/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { navbarPageName } from 'src/app/enum/navbarPageName.enum';
import { LandingPageSection } from 'src/app/models/landing-page-section.model';
import { HttpService } from 'src/app/services/http.service';
import { ScreenSizeService } from 'src/app/services/screen-size.service';

@UntilDestroy()
@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  animations: [
    trigger('fadeIn', [
      transition('* => *', [
        query(
          ':enter',
          [
            style({ opacity: 0 }),
            stagger(200, [animate('0.3s', style({ opacity: 1 }))]),
          ],
          { optional: true }
        ),
      ]),
    ]),
  ],
})
export class HomeComponent implements OnInit {
  public landingPageSection: LandingPageSection[] = [];
  public activeCategory = '';
  public navbarPageName = navbarPageName;

  public get screenSize(): string {
    return this.screenSizeService.currentScreenSize;
  }

  constructor(
    private httpService: HttpService,
    private screenSizeService: ScreenSizeService
  ) {}

  ngOnInit(): void {
    this.initDatas();
  }

  private initDatas() {
    this.httpService
      .getLandingPagePics()
      .pipe(untilDestroyed(this))
      .subscribe((res) => {
        this.landingPageSection = res as LandingPageSection[];
      });
  }

  public setActiveCategory(category: string) {
    if (category === this.activeCategory) {
      this.activeCategory = '';
      return;
    }
    this.activeCategory = category;
  }
}
