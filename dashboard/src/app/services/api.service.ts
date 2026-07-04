import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

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

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = '/api';

  constructor(private http: HttpClient) {}

  getActivities(limit = 100, offset = 0) {
    return this.http.get<Activity[]>(`${this.base}/activities?limit=${limit}&offset=${offset}`);
  }

  getStatus() {
    return this.http.get<Status>(`${this.base}/status`);
  }

  getBreakdown() {
    return this.http.get<BreakdownItem[]>(`${this.base}/stats/breakdown`);
  }
}
