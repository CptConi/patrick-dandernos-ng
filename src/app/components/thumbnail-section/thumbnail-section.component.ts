import { Component, Input, OnInit } from '@angular/core';
import { LandingPageSection } from 'src/app/models/landing-page-section.model';

@Component({
  selector: 'app-thumbnail-section',
  templateUrl: './thumbnail-section.component.html',
  styleUrls: ['./thumbnail-section.component.scss'],
})
export class ThumbnailSectionComponent implements OnInit {
  @Input() landingPageSection!: LandingPageSection;

  constructor() {}

  ngOnInit(): void {}
}
