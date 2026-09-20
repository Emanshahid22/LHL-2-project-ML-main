import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { FormTemplate } from '@mgs/shared';

@Injectable({ providedIn: 'root' })
export class TemplatesService {
  private readonly http = inject(HttpClient);

  getTemplates(): Observable<FormTemplate[]> {
    return this.http.get<FormTemplate[]>('/api/form-templates');
  }

  getTemplate(code: string): Observable<FormTemplate> {
    return this.http.get<FormTemplate>(`/api/form-templates/${encodeURIComponent(code)}`);
  }
}
