import { animate, query, stagger, style, transition, trigger } from '@angular/animations';
import { Component, OnInit } from '@angular/core';
import { take } from 'rxjs/operators';
import { HttpService } from 'src/app/services/http.service';

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
export class GalleryComponent implements OnInit {
  private readonly categoryFromPathname = new Map<string, string>([
    ['/mondes-macros', 'macros'],
    ['/au-cafe-des-graphistes', 'graphistes'],
    ['/studio-portrait', 'portraits'],
  ]);
  public currentCategory: string;
  public pictureList: any[] = [];
  public indexFullscreenablePicture = -1;

  constructor(private http: HttpService) {
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
}
