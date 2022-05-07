import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class HttpService {
  private readonly URL = 'http://15.237.23.153:3001/files';
  constructor(private http: HttpClient) {}

  public getAllPictures() {
    return this.http.get(this.URL);
  }

  public postPicture(formData: FormData, uri: string) {
    return this.http.post(uri, formData);
  }

  public deletePicture(id: number) {
    return this.http.delete(`${this.URL}/${id}`);
  }

  public setLandingPagePicture(id: number, category: string) {
    return this.http.put(`${this.URL}/category`, { id: id });
  }

  public getLandingPagePics() {
    return this.http.get(`${this.URL}/landingpagepics`);
  }

  public getGalleryFromCategory(category: string) {
    return this.http.get(`${this.URL}/gallery/${category}`);
  }

  public getOnePicture(id: number) {
    return this.http.get(`${this.URL}/picture/${id}`);
  }
}
