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
  job: string | null;
  job_description: string | null;
  screenshot_id: number | null;
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

export interface AccumulatedItem {
  label: string;
  total_sec: number;
}

export interface RuleOut {
  id: number;
  category_id: number;
  process_regex: string | null;
  title_regex: string | null;
}

export interface RuleIn {
  process_regex: string | null;
  title_regex: string | null;
  recompute_from: string | null;
}

export interface TimelineActivity {
  id: number;
  start_ts: string;
  end_ts: string | null;
  duration_sec: number | null;
  process: string | null;
  title: string | null;
  category: string | null;
  job: string | null;
  job_description: string | null;
}

export interface CategoryOut {
  id: number;
  name: string;
  color: string;
  priority: number;
  enabled: boolean;
  rules: RuleOut[];
}

export interface CategoryIn {
  name: string;
  color: string;
  priority: number;
  enabled: boolean;
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

  getBreakdown(fromTs?: string, toTs?: string, categoryFilter?: string, processFilter?: string, titleFilter?: string) {
    const params: Record<string, string> = {};
    if (fromTs)          params['from_ts']  = fromTs;
    if (toTs)            params['to_ts']    = toTs;
    if (categoryFilter)  params['category'] = categoryFilter;
    if (processFilter)   params['process']  = processFilter;
    if (titleFilter)     params['title']    = titleFilter;
    return this.http.get<BreakdownItem[]>(`${this.base}/stats/breakdown`, { params });
  }

  getAccumulated(
    groupBy: 'category' | 'process' | 'title' | 'job',
    fromTs?: string,
    toTs?: string,
    topN = 20,
    filterCategory?: string,
    filterProcess?: string,
    filterTitle?: string,
    filterJob?: string,
  ) {
    const params: Record<string, string> = { group_by: groupBy, top_n: String(topN) };
    if (fromTs)          params['from_ts']         = fromTs;
    if (toTs)            params['to_ts']           = toTs;
    if (filterCategory)  params['filter_category'] = filterCategory;
    if (filterProcess)   params['filter_process']  = filterProcess;
    if (filterTitle)     params['filter_title']    = filterTitle;
    if (filterJob)       params['filter_job']      = filterJob;
    return this.http.get<AccumulatedItem[]>(`${this.base}/stats/accumulated`, { params });
  }

  getTimeline(fromTs: string, toTs: string) {
    return this.http.get<TimelineActivity[]>(`${this.base}/activities/timeline`, {
      params: { from_ts: fromTs, to_ts: toTs },
    });
  }

  // ── Categories ──

  getCategories() {
    return this.http.get<CategoryOut[]>(`${this.base}/categories`);
  }

  createCategory(data: CategoryIn) {
    return this.http.post<CategoryOut>(`${this.base}/categories`, data);
  }

  updateCategory(id: number, data: CategoryIn) {
    return this.http.put<CategoryOut>(`${this.base}/categories/${id}`, data);
  }

  deleteCategory(id: number) {
    return this.http.delete(`${this.base}/categories/${id}`);
  }

  // ── Rules ──

  createRule(categoryId: number, data: RuleIn) {
    return this.http.post<RuleOut>(`${this.base}/categories/${categoryId}/rules`, data);
  }

  updateRule(ruleId: number, data: RuleIn) {
    return this.http.put<RuleOut>(`${this.base}/categories/rules/${ruleId}`, data);
  }

  deleteRule(ruleId: number) {
    return this.http.delete(`${this.base}/categories/rules/${ruleId}`);
  }

  // ── Screenshots ──

  getScreenshots(params: { limit?: number; offset?: number; activity_id?: number; from_ts?: string; to_ts?: string } = {}) {
    const q: Record<string, string> = {};
    if (params.limit != null)      q['limit']       = String(params.limit);
    if (params.offset != null)     q['offset']      = String(params.offset);
    if (params.activity_id != null) q['activity_id'] = String(params.activity_id);
    if (params.from_ts)            q['from_ts']      = params.from_ts;
    if (params.to_ts)              q['to_ts']        = params.to_ts;
    return this.http.get<{ items: ScreenshotInfo[]; total: number }>(`${this.base}/screenshots`, { params: q });
  }

  getScreenshotImageUrl(shotId: number): string {
    return `${this.base}/screenshots/${shotId}/image`;
  }

  getScreenshotNear(ts: string) {
    return this.http.get<ScreenshotInfo | null>(`${this.base}/screenshots/near`, { params: { ts } });
  }

  // ── Config ──

  getConfig() {
    return this.http.get<AppConfig>(`${this.base}/config`);
  }

  updateConfig(data: Partial<AppConfig>) {
    return this.http.put(`${this.base}/config`, data);
  }

  pickDirectory(current: string) {
    return this.http.get<{ path: string }>(`${this.base}/config/pick-dir`, {
      params: { current },
    });
  }

  // ── Jobs & Tracking ──

  getJobs() {
    return this.http.get<JobOut[]>(`${this.base}/jobs`);
  }

  saveJob(data: { name: string; description: string | null }) {
    return this.http.post<JobOut>(`${this.base}/jobs`, data);
  }

  jobAutocomplete(q: string) {
    return this.http.get<{ name: string; description: string | null }[]>(`${this.base}/jobs/autocomplete`, { params: { q } });
  }

  assignActivityJob(id: number, job: string | null, description: string | null) {
    return this.http.put(`${this.base}/activities/${id}/job`, null, {
      params: { job: job || '', description: description || '' },
    });
  }

  getManualJob() {
    return this.http.get<{ active: boolean; job: string; description: string }>(`${this.base}/tracking/manual-job`);
  }

  setManualJob(job: string, description: string | null) {
    return this.http.post(`${this.base}/tracking/manual-job`, { job, description });
  }

  clearManualJob() {
    return this.http.delete(`${this.base}/tracking/manual-job`);
  }
}

export interface JobOut {
  id: number;
  name: string;
  description: string | null;
}

export interface AppConfig {
  screenshot_interval_sec: number;
  screenshot_quality: string;
  screenshot_dir: string;
  retention_days: number;
  poll_interval_sec: number;
  db_path: string;
}

export interface ScreenshotInfo {
  id: number;
  activity_id: number | null;
  timestamp: string;
  file_path: string;
  file_size: number;
}
