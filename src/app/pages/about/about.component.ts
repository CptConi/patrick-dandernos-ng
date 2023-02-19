import {
  animate,
  state,
  style,
  transition,
  trigger,
} from '@angular/animations';
import { Component, OnInit } from '@angular/core';
import { navbarPageName } from 'src/app/enum/navbarPageName.enum';
import { ScreenSizeService } from 'src/app/services/screen-size.service';

@Component({
  selector: 'app-about',
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss'],
  animations: [
    trigger('fadeIn', [
      state('in', style({ opacity: 1 })),

      transition(':enter', [style({ opacity: 0 }), animate(600)]),

      transition(':leave', animate(600, style({ opacity: 0 }))),
    ]),
  ],
})
export class AboutComponent implements OnInit {
  public navbarPageName = navbarPageName;
  public get screenSize(): string {
    return this.screenSizeService.currentScreenSize;
  }
  public get smallDevice(): boolean {
    return this.screenSize === 'XSmall' || this.screenSize === 'Small';
  }

  constructor(private screenSizeService: ScreenSizeService) {}

  ngOnInit(): void {}
}
