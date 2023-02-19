import { Component } from '@angular/core';
import { navbarPageName } from 'src/app/enum/navbarPageName.enum';

@Component({
  selector: 'app-pricing',
  templateUrl: './pricing.component.html',
  styleUrls: ['./pricing.component.scss'],
})
export class PricingComponent {
  public navbarPageName = navbarPageName;
}
