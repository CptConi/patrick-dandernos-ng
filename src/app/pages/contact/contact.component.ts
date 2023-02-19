import { Component, OnInit } from '@angular/core';
import { navbarPageName } from 'src/app/enum/navbarPageName.enum';

@Component({
  selector: 'app-contact',
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss'],
})
export class ContactComponent implements OnInit {
  public navbarPageName = navbarPageName;

  constructor() {}

  ngOnInit(): void {}
}
