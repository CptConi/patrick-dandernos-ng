import { Component, OnInit } from '@angular/core';
import { take } from 'rxjs/operators';
import { HttpService } from 'src/app/services/http.service';

@Component({
  selector: 'app-gallery',
  templateUrl: './gallery.component.html',
  styleUrls: ['./gallery.component.scss'],
})
export class GalleryComponent implements OnInit {
  private readonly categoryFromPathname = new Map<string, string>([
    ['/mondes-macros', 'macros'],
    ['/au-cafe-des-graphistes', 'graphistes'],
    ['/studio-portrait', 'portraits'],
  ]);
  public currentCategory: string;
  public pictureList: any[] = [];

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
}
