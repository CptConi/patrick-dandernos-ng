import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { RemotePhoto } from '../three/studio.types';

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

  public getLandingPagePics(): Observable<RemotePhoto[]> {
    return this.http.get<RemotePhoto[]>(`${this.URL}/landingpagepics`);
  }

  /** Oldest first, as served by the backend (reverse for newest-first display). */
  public getGalleryFromCategory(category: string): Observable<RemotePhoto[]> {
    return this.http.get<RemotePhoto[]>(`${this.URL}/gallery/${category}`);
  }

  public getOnePicture(id: number) {
    return this.http.get(`${this.URL}/picture/${id}`);
  }
}
