import { animate, state, style, transition, trigger } from '@angular/animations';
import { Component, OnInit } from '@angular/core';

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
  constructor() {}

  ngOnInit(): void {}
}
