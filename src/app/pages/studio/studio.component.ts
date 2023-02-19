import { Component } from '@angular/core';
import { navbarPageName } from 'src/app/enum/navbarPageName.enum';

@Component({
  selector: 'app-studio',
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.scss'],
})
export class StudioComponent {
  public navbarPageName = navbarPageName;
}
