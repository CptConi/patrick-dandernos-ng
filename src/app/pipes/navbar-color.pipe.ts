import { Pipe, PipeTransform } from '@angular/core';
import { navbarPageName } from '../enum/navbarPageName.enum';

@Pipe({
  name: 'navbarColor',
})
export class NavbarColorPipe implements PipeTransform {
  transform(pageName: navbarPageName): string {
    switch (pageName) {
      case navbarPageName.HOME:
        return 'primary';

      case navbarPageName.ABOUT:
        return 'accent';

      case navbarPageName.CONTACT:
        return 'warn';

      case navbarPageName.PRICING:
        return 'warn';

      default:
        return 'primary';
    }
  }
}
