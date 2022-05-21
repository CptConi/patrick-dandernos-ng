import { Injectable } from '@angular/core';
import FastAverageColor from 'fast-average-color';

@Injectable({
  providedIn: 'root',
})
export class ColorsService {
  constructor() {}

  public getAverageColor(ref: HTMLImageElement) {
    const fac = new FastAverageColor();

    const color = fac.getColor(ref);
  }
}
