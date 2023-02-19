import { Component, Input } from '@angular/core';
import { navbarPageName } from 'src/app/enum/navbarPageName.enum';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
})
export class NavbarComponent {
  public navBarPageName = navbarPageName;

  @Input() isActive: navbarPageName = navbarPageName.HOME;
}
