import { Component, OnInit } from '@angular/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { LandingPageSection } from 'src/app/models/landing-page-section.model';
import { HttpService } from 'src/app/services/http.service';
import { ScreenSizeService } from 'src/app/services/screen-size.service';

@UntilDestroy()
@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit {
  public landingPageSection: LandingPageSection[] = [];

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
        console.log(res);
        this.landingPageSection = res as LandingPageSection[];
      });
  }
}
