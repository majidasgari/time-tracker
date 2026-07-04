import { Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';

export interface Activity {
  id: number;
  start_ts: string;
  end_ts: string | null;
  duration_sec: number | null;
  process: string | null;
  title: string | null;
  category: string | null;
}

export interface Status {
  total_activities: number;
  total_tracked_sec: number;
  backend: string;
}

export interface BreakdownItem {
  category: string;
  total_sec: number;
}

export interface ActivityFilter {
  limit?: number;
  offset?: number;
  category?: string;
  process?: string;
  title?: string;
  from_ts?: string;
  to_ts?: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = '/api';

  constructor(private http: HttpClient) {}

  getActivities(filter: ActivityFilter = {}) {
    const params: Record<string, string> = {};
    if (filter.limit != null)    params['limit']    = String(filter.limit);
    if (filter.offset != null)   params['offset']   = String(filter.offset);
    if (filter.category)         params['category'] = filter.category;
    if (filter.process)          params['process']  = filter.process;
    if (filter.title)            params['title']    = filter.title;
    if (filter.from_ts)          params['from_ts']  = filter.from_ts;
    if (filter.to_ts)            params['to_ts']    = filter.to_ts;
    return this.http.get<Activity[]>(`${this.base}/activities`, {
      params,
      observe: 'response',
    });
  }

  getStatus() {
    return this.http.get<Status>(`${this.base}/status`);
  }

  getBreakdown() {
    return this.http.get<BreakdownItem[]>(`${this.base}/stats/breakdown`);
  }
}
