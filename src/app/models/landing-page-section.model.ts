import { LandingPageCategory } from '../enum/landing-page-category.enum';

export interface LandingPageSection {
  category: LandingPageCategory;
  description: string;
  fullsizePath: string;
  halfsizePath: string;
  miniaturePath: string;
  name: string;
  isOnLandingPage: boolean;
}
