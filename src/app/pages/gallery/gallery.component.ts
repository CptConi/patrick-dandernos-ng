import { animate, query, stagger, style, transition, trigger } from '@angular/animations';
import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import FastAverageColor from 'fast-average-color';
import { take } from 'rxjs/operators';
import { ColorsService } from 'src/app/services/colors.service';
import { HttpService } from 'src/app/services/http.service';
import { ScreenSizeService } from 'src/app/services/screen-size.service';

@Component({
  selector: 'app-gallery',
  templateUrl: './gallery.component.html',
  styleUrls: ['./gallery.component.scss'],
  animations: [
    trigger('fadeIn', [
      transition('* => *', [
        query(
          ':enter',
          [
            style({ opacity: 0 }),
            stagger(150, [animate('0.7s', style({ opacity: 1 }))]),
          ],
          { optional: true }
        ),
      ]),
    ]),
    trigger('inOutAnimation', [
      transition(':enter', [
        style({ height: 0, opacity: 0 }),
        animate('0.4s ease-out', style({ height: 48, opacity: 1 })),
      ]),
      transition(':leave', [
        style({ height: 48, opacity: 1 }),
        animate('0.2s ease-in', style({ height: 0, opacity: 0 })),
      ]),
    ]),
  ],
})
export class GalleryComponent implements OnInit, AfterViewInit {
  private readonly categoryFromPathname = new Map<string, string>([
    ['/mondes-macros', 'macros'],
    ['/au-cafe-des-graphistes', 'graphistes'],
    ['/studio-portrait', 'portraits'],
  ]);
  public currentCategory: string;
  public pictureList: any[] = [];
  public indexFullscreenablePicture = -1;
  public activePictureIndex = 0;
  // public dominantColor = '';

  public get screenSize(): string {
    return this.screenSizeService.currentScreenSize;
  }
  public get smallDevice(): boolean {
    return this.screenSize === 'XSmall' || this.screenSize === 'Small';
  }

  @ViewChild('currentPicture') currentPicture: any;

  constructor(
    private http: HttpService,
    private screenSizeService: ScreenSizeService,
    private colorService: ColorsService
  ) {
    // @ts-ignore
    this.currentCategory = this.categoryFromPathname.get(
      window.location.pathname
    );
  }

  ngOnInit(): void {
    this.http
      .getGalleryFromCategory(this.currentCategory)
      .pipe(take(1))
      .subscribe((galerie) => {
        console.log(galerie);
        this.pictureList = (galerie as any[]).reverse();
      });
  }

  ngAfterViewInit(): void {}

  public setImageFullscreenable(index: number) {
    if (this.indexFullscreenablePicture === index) {
      this.indexFullscreenablePicture = -1;
      return;
    }
    this.indexFullscreenablePicture = index;
  }

  public openFullscreenPictureInNewTab(index: number) {
    this.indexFullscreenablePicture = -1;
    window.open(this.pictureList[index].fullSizePath, '_blank');
  }

  public previousPicture() {
    if (this.activePictureIndex === 0) {
      this.activePictureIndex = this.pictureList.length - 1;
      return;
    }
    this.activePictureIndex--;
  }

  public nextPicture() {
    if (this.activePictureIndex < this.pictureList.length - 1) {
      this.activePictureIndex++;

      return;
    }
    this.activePictureIndex = 0;
  }

  public onLoadImage(event: any) {
    console.log(event.path[0].currentSrc);

    const bg = document.querySelector('body');
    const fac = new FastAverageColor();
    fac
      .getColorAsync(event.path[0].currentSrc)
      .then((color) => {
        if (bg) {
          bg.style.backgroundImage = 'none';
          bg.style.backgroundColor = color.rgba;
          bg.style.color = color.isDark ? '#fff' : '#000';
        }

        console.log('Average color', color);
      })
      .catch((e) => {
        console.log(e);
      });
  }
}
