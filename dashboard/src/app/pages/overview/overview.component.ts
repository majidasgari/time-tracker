import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, ActivityFilter, BreakdownItem, Status, CategoryOut, JobOut } from '../../services/api.service';
import { Subject, debounceTime, takeUntil } from 'rxjs';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <h1 class="text-2xl font-bold">Overview</h1>

      <!-- Stats cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-gray-800 rounded-xl p-5 text-center">
          <div class="text-gray-400 text-sm">Activities</div>
          <div class="text-3xl font-bold mt-1">{{ status?.total_activities ?? 0 }}</div>
        </div>
        <div class="bg-gray-800 rounded-xl p-5 text-center">
          <div class="text-gray-400 text-sm">Tracked Time</div>
          <div class="text-3xl font-bold mt-1">{{ (status?.total_tracked_sec ?? 0) / 3600 | number:'1.0-1' }}h</div>
        </div>
        <div class="bg-gray-800 rounded-xl p-5 text-center">
          <div class="text-gray-400 text-sm">Backend</div>
          <div class="text-lg font-bold mt-1">{{ status?.backend }}</div>
        </div>
      </div>

      <!-- Category breakdown -->
      <div class="bg-gray-800 rounded-xl p-5">
        <h2 class="text-lg font-semibold mb-4">Time by Category</h2>
        <div class="space-y-3">
          <div *ngFor="let item of breakdown" class="flex items-center gap-3">
            <span class="w-28 text-sm truncate">{{ item.category }}</span>
            <div class="flex-1 bg-gray-700 rounded-full h-4">
              <div class="bg-blue-500 h-4 rounded-full transition-all" [style.background]="getCategoryColor(item.category)" [style.width.%]="item.total_sec / maxSec * 100"></div>
            </div>
            <span class="text-sm w-16 text-right">{{ item.total_sec / 60 | number:'1.0-0' }}m</span>
          </div>
        </div>
      </div>

      <!-- Manual Job -->
      <div class="bg-gray-800 rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <span class="text-sm text-gray-400 flex-shrink-0">Manual Job</span>
        <button (click)="toggleManualJob()"
          [class]="'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ' +
            (manualActive ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300')">
          {{ manualActive ? 'ON' : 'OFF' }}
        </button>
        <input type="text" [(ngModel)]="manualJobName" (ngModelChange)="onManualJobNameChange()"
          (focus)="showJobSuggestions = true" (blur)="hideJobSuggestions()"
          placeholder="Job name…"
          class="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none focus:border-indigo-500" />
        <!-- autocomplete dropdown -->
        <div *ngIf="showJobSuggestions && jobSuggestions.length > 0" class="absolute z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl mt-20 ml-24 max-h-40 overflow-y-auto min-w-[160px]">
          <div *ngFor="let s of jobSuggestions" (mousedown)="selectManualJob(s)"
            class="px-3 py-1.5 text-sm hover:bg-gray-700 cursor-pointer text-gray-300">
            {{ s.name }}
          </div>
        </div>
        <input type="text" [(ngModel)]="manualJobDesc" placeholder="Description…"
          class="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[200px] focus:outline-none focus:border-indigo-500" />
        <button (click)="applyManualJob()"
          class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm transition-colors flex-shrink-0">
          Apply
        </button>
        <button *ngIf="manualActive" (click)="clearManualJob()"
          class="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-sm transition-colors flex-shrink-0">
          Clear
        </button>
      </div>

      <!-- Activities table -->
      <div class="bg-gray-800 rounded-xl p-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold">Activities</h2>
          <div class="flex items-center gap-4 text-sm">
            <span class="text-gray-400">{{ totalCount }} result{{ totalCount !== 1 ? 's' : '' }}</span>
            <span class="text-gray-300 font-mono">{{ totalDurationClock }}</span>
            <span class="text-gray-500 font-mono">({{ totalDurationDecimal }})</span>
          </div>
        </div>

        <!-- Filters -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
          <input
            id="filter-process"
            type="text"
            placeholder="Process…"
            [(ngModel)]="filterProcess"
            (ngModelChange)="onFilterChange()"
            class="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <input
            id="filter-category"
            type="text"
            placeholder="Category…"
            [(ngModel)]="filterCategory"
            (ngModelChange)="onFilterChange()"
            class="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <input
            id="filter-title"
            type="text"
            placeholder="Title…"
            [(ngModel)]="filterTitle"
            (ngModelChange)="onFilterChange()"
            class="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <input
            id="filter-from"
            type="datetime-local"
            [(ngModel)]="filterFrom"
            (ngModelChange)="onFilterChange()"
            class="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
          <input
            id="filter-to"
            type="datetime-local"
            [(ngModel)]="filterTo"
            (ngModelChange)="onFilterChange()"
            class="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        <!-- Table -->
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-gray-400 border-b border-gray-700">
                <th class="text-center py-2 px-2">Time</th>
                <th class="text-center py-2 px-2">Process</th>
                <th class="text-center py-2 px-2">Category</th>
                <th class="text-center py-2 px-2">Job</th>
                <th class="text-center py-2 px-2 max-w-xs">Title</th>
                <th class="text-center py-2 px-2">Duration</th>
                <th class="text-center py-2 px-2">Shot</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let a of activities" class="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                <td class="py-2 px-2 text-center whitespace-nowrap text-gray-300">{{ a.start_ts?.slice(0, 10) }} {{ a.start_ts?.slice(11, 19) }}</td>
                <td class="py-2 px-2 text-center cursor-pointer hover:text-indigo-400 transition-colors"
                  (click)="openCategorize('process', a.process)">{{ a.process || '—' }}</td>
                <td class="py-2 px-2 text-center">
                  <span class="px-2 py-0.5 rounded text-xs" [style.background]="getCategoryColor(a.category)">
                    {{ a.category || '—' }}
                  </span>
                </td>
                <td class="py-2 px-2 text-center">
                  <span *ngIf="editingJobId !== a.id"
                    (click)="startEditJob(a.id, a.job, a.job_description)"
                    class="cursor-pointer hover:text-indigo-400 text-xs"
                    [class.text-indigo-300]="a.job"
                    [class.text-gray-500]="!a.job">
                    {{ a.job || '—' }}
                  </span>
                  <div *ngIf="editingJobId === a.id" class="flex flex-col gap-1" (click)="$event.stopPropagation()">
                    <input #jobInput [(ngModel)]="editJobName" placeholder="Job…"
                      class="bg-gray-700 border border-gray-600 rounded px-2 py-0.5 text-xs w-24 focus:outline-none focus:border-indigo-500" />
                    <input [(ngModel)]="editJobDesc" placeholder="Description…"
                      class="bg-gray-700 border border-gray-600 rounded px-2 py-0.5 text-xs w-24 focus:outline-none focus:border-indigo-500" />
                    <div class="flex gap-1">
                      <button (click)="saveJobAssignment(a.id)"
                        class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-600 text-white">Save</button>
                      <button (click)="editingJobId = null"
                        class="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">Cancel</button>
                    </div>
                  </div>
                </td>
                <td class="py-2 px-2 text-center max-w-xs">
                  <span class="block truncate cursor-pointer hover:text-indigo-400 transition-colors" [title]="a.title || ''"
                    (click)="openCategorize('title', a.title)">{{ a.title || '—' }}</span>
                </td>
                <td class="py-2 px-2 text-center whitespace-nowrap font-mono">{{ formatDuration(a) }}</td>
                <td class="py-2 px-1 text-center">
                  <img *ngIf="a.screenshot_id != null"
                    [src]="screenshotUrl(a.screenshot_id)"
                    class="w-14 h-10 object-cover rounded border border-gray-700 cursor-pointer hover:ring-1 hover:ring-indigo-500 mx-auto"
                    (click)="$event.stopPropagation(); previewScreenshotId = a.screenshot_id"
                    alt="shot" />
                  <span *ngIf="a.screenshot_id == null" class="text-gray-600 text-[10px]">—</span>
                </td>
              </tr>
              <tr *ngIf="activities.length === 0">
                <td colspan="7" class="py-8 text-center text-gray-500">No activities found</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="flex items-center justify-between mt-4 text-sm">
          <button
            id="page-prev"
            (click)="prevPage()"
            [disabled]="page === 0"
            class="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            ← Prev
          </button>
          <span class="text-gray-400">
            Page {{ page + 1 }} of {{ totalPages }}
            &nbsp;({{ pageStart }}–{{ pageEnd }} of {{ totalCount }})
          </span>
          <button
            id="page-next"
            (click)="nextPage()"
            [disabled]="page >= totalPages - 1"
            class="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Next →
          </button>
        </div>
      </div>
    </div>

    <!-- Categorize modal -->
    <div *ngIf="showCatModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" (click)="showCatModal = false">
      <div class="bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl border border-gray-700" (click)="$event.stopPropagation()">
        <h2 class="text-lg font-semibold mb-4">Add to Category</h2>
        <div class="space-y-3">
          <div class="text-sm text-gray-400">
            Create a rule for <code class="text-indigo-300 font-mono">{{ catModalValue }}</code>
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">Category</label>
            <select [(ngModel)]="catModalCategoryId"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
              <option *ngFor="let c of categories" [value]="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">Regex</label>
            <input type="text" [(ngModel)]="catModalRegex"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500" />
          </div>
        </div>
        <div class="flex items-center justify-end gap-3 mt-5">
          <button (click)="showCatModal = false"
            class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-colors">Cancel</button>
          <button (click)="saveCategorize()"
            class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors">Add Rule</button>
        </div>
      </div>
    </div>

    <!-- Screenshot preview overlay -->
    <div *ngIf="previewScreenshotId != null" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/80"
      (click)="previewScreenshotId = null">
      <img [src]="screenshotUrl(previewScreenshotId)" class="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl" alt="Screenshot preview" />
    </div>
  `
})
export class OverviewComponent implements OnInit, OnDestroy {
  activities: any[] = [];
  breakdown: BreakdownItem[] = [];
  status: Status | null = null;
  maxSec = 1;
  categoryColors: Record<string, string> = {};

  // Manual job
  manualActive = false;
  manualJobName = '';
  manualJobDesc = '';
  jobSuggestions: { name: string; description: string | null }[] = [];
  showJobSuggestions = false;

  // Inline job editing
  editingJobId: number | null = null;
  editJobName = '';
  editJobDesc = '';

  // Screenshot preview
  previewScreenshotId: number | null = null;

  // Categorize dialog
  showCatModal = false;
  catModalType: 'process' | 'title' = 'process';
  catModalValue = '';
  catModalRegex = '';
  catModalCategoryId: number | null = null;
  categories: CategoryOut[] = [];

  // Filters
  filterProcess  = '';
  filterCategory = '';
  filterTitle    = '';
  filterFrom     = '';
  filterTo       = '';

  // Pagination
  page       = 0;
  pageSize   = PAGE_SIZE;
  totalCount = 0;
  totalDurationSec = 0;

  get totalPages() { return Math.max(1, Math.ceil(this.totalCount / this.pageSize)); }
  get pageStart()  { return this.totalCount === 0 ? 0 : this.page * this.pageSize + 1; }
  get pageEnd()    { return Math.min((this.page + 1) * this.pageSize, this.totalCount); }

  private destroy   = new Subject<void>();
  private filter$   = new Subject<void>();

  constructor(private api: ApiService) {}

  ngOnInit() {
    // Debounce text filter changes so we don't hammer the server on every keystroke.
    this.filter$.pipe(debounceTime(300), takeUntil(this.destroy)).subscribe(() => {
      this.page = 0;
      this.loadActivities();
      this.loadSummary();
    });

    this.loadCategories();
    this.loadManualJob();
    this.loadActivities();
    this.loadSummary();
    setInterval(() => {
      this.loadActivities();
      this.loadSummary();
    }, 10_000);
  }

  ngOnDestroy() {
    this.destroy.next();
  }

  onFilterChange() {
    this.filter$.next();
  }

  prevPage() {
    if (this.page > 0) { this.page--; this.loadActivities(); }
  }

  nextPage() {
    if (this.page < this.totalPages - 1) { this.page++; this.loadActivities(); }
  }

  loadActivities() {
    const filter: ActivityFilter = {
      limit:    this.pageSize,
      offset:   this.page * this.pageSize,
      category: this.filterCategory || undefined,
      process:  this.filterProcess  || undefined,
      title:    this.filterTitle    || undefined,
      from_ts:  this.filterFrom ? new Date(this.filterFrom).toISOString() : undefined,
      to_ts:    this.filterTo   ? new Date(this.filterTo).toISOString()   : undefined,
    };

    this.api.getActivities(filter).subscribe(resp => {
      this.activities  = resp.body ?? [];
      this.totalCount  = Number(resp.headers.get('X-Total-Count') ?? 0);
      this.totalDurationSec = Number(resp.headers.get('X-Total-Duration-Sec') ?? 0);
    });
  }

  loadSummary() {
    const fromIso = this.filterFrom ? new Date(this.filterFrom).toISOString() : undefined;
    const toIso   = this.filterTo   ? new Date(this.filterTo).toISOString()   : undefined;
    this.api.getBreakdown(
      fromIso, toIso,
      this.filterCategory || undefined,
      this.filterProcess  || undefined,
      this.filterTitle    || undefined,
    ).subscribe(b => {
      this.breakdown = b;
      this.maxSec = Math.max(1, ...b.map(x => x.total_sec));
    });
    this.api.getStatus().subscribe(s => this.status = s);
  }

  loadCategories() {
    this.api.getCategories().subscribe(cats => {
      this.categoryColors = {};
      this.categories = cats;
      for (const c of cats) {
        this.categoryColors[c.name] = c.color;
      }
    });
  }

  getCategoryColor(name: string | null): string {
    return name ? (this.categoryColors[name] || '#555555') : '#555555';
  }

  screenshotUrl(id: number): string {
    return this.api.getScreenshotImageUrl(id);
  }

  get totalDurationDecimal(): string {
    const h = this.totalDurationSec / 3600;
    return h >= 1 ? h.toFixed(1) + 'h' : (this.totalDurationSec / 60).toFixed(1) + 'm';
  }

  get totalDurationClock(): string {
    const sec = this.totalDurationSec;
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  }

  formatDuration(a: any): string {
    let sec: number;
    if (a.duration_sec != null) {
      sec = a.duration_sec;
    } else if (a.start_ts) {
      sec = Math.floor((Date.now() - new Date(a.start_ts).getTime()) / 1000);
    } else {
      return '—';
    }
    if (sec < 60)   return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  }

  // ── Manual Job ──

  loadManualJob() {
    this.api.getManualJob().pipe(takeUntil(this.destroy)).subscribe(m => {
      this.manualActive = m.active;
      this.manualJobName = m.job;
      this.manualJobDesc = m.description;
    });
  }

  toggleManualJob() {
    this.manualActive = !this.manualActive;
    if (this.manualActive && this.manualJobName) {
      this.api.setManualJob(this.manualJobName, this.manualJobDesc).subscribe();
    } else if (!this.manualActive) {
      this.api.clearManualJob().subscribe();
    }
  }

  onManualJobNameChange() {
    if (!this.manualJobName) { this.jobSuggestions = []; return; }
    this.api.jobAutocomplete(this.manualJobName).subscribe(s => {
      this.jobSuggestions = s;
    });
  }

  selectManualJob(s: { name: string; description: string | null }) {
    this.manualJobName = s.name;
    this.manualJobDesc = s.description || '';
    this.jobSuggestions = [];
    this.showJobSuggestions = false;
  }

  hideJobSuggestions() {
    setTimeout(() => { this.showJobSuggestions = false; }, 200);
  }

  applyManualJob() {
    this.api.setManualJob(this.manualJobName, this.manualJobDesc).subscribe(() => {
      this.loadManualJob();
    });
  }

  clearManualJob() {
    this.api.clearManualJob().subscribe(() => {
      this.manualActive = false;
      this.manualJobName = '';
      this.manualJobDesc = '';
    });
  }

  // ── Inline Job Edit ──

  startEditJob(id: number, job: string | null, desc: string | null) {
    this.editingJobId = id;
    this.editJobName = job || '';
    this.editJobDesc = desc || '';
  }

  saveJobAssignment(activityId: number) {
    const j = this.editJobName || null;
    const d = this.editJobDesc || null;
    this.api.assignActivityJob(activityId, j, d).subscribe(() => {
      this.editingJobId = null;
      // Also save job to job list for autocomplete
      if (j) {
        this.api.saveJob({ name: j, description: d }).subscribe();
      }
      this.loadActivities();
    });
  }

  // ── Categorize ──

  openCategorize(type: 'process' | 'title', value: string) {
    if (!value) return;
    this.catModalType = type;
    this.catModalValue = value;
    this.catModalRegex = `.*${this._escapeRegex(value)}.*`;
    this.catModalCategoryId = this.categories.length > 0 ? this.categories[0].id : null;
    this.showCatModal = true;
  }

  saveCategorize() {
    if (!this.catModalCategoryId || !this.catModalRegex) return;
    const body: any = {};
    if (this.catModalType === 'process') {
      body.process_regex = this.catModalRegex;
    } else {
      body.title_regex = this.catModalRegex;
    }
    this.api.createRule(this.catModalCategoryId, body).subscribe({
      next: () => {
        this.showCatModal = false;
        this.loadCategories();
        this.loadActivities();
      },
      error: () => {},
    });
  }

  private _escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
