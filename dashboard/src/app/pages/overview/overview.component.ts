import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, ActivityFilter, BreakdownItem, Status } from '../../services/api.service';
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
              <div class="bg-blue-500 h-4 rounded-full transition-all" [style.width.%]="item.total_sec / maxSec * 100"></div>
            </div>
            <span class="text-sm w-16 text-right">{{ item.total_sec / 60 | number:'1.0-0' }}m</span>
          </div>
        </div>
      </div>

      <!-- Activities table -->
      <div class="bg-gray-800 rounded-xl p-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold">Activities</h2>
          <span class="text-sm text-gray-400">{{ totalCount }} result{{ totalCount !== 1 ? 's' : '' }}</span>
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
                <th class="text-center py-2 px-2 max-w-xs">Title</th>
                <th class="text-center py-2 px-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let a of activities" class="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                <td class="py-2 px-2 text-center whitespace-nowrap text-gray-300">{{ a.start_ts?.slice(0, 10) }} {{ a.start_ts?.slice(11, 19) }}</td>
                <td class="py-2 px-2 text-center">{{ a.process || '—' }}</td>
                <td class="py-2 px-2 text-center">
                  <span class="px-2 py-0.5 rounded text-xs"
                    [class.bg-red-500]="a.category === 'کدنویسی'"
                    [class.bg-blue-500]="a.category === 'مرورگر'"
                    [class.bg-orange-500]="a.category === 'ترمینال'"
                    [class.bg-gray-500]="a.category === 'Idle'"
                    [class.bg-purple-600]="a.category && !['کدنویسی','مرورگر','ترمینال','Idle'].includes(a.category)">
                    {{ a.category || '—' }}
                  </span>
                </td>
                <td class="py-2 px-2 text-center max-w-xs">
                  <span class="block truncate" [title]="a.title || ''">{{ a.title || '—' }}</span>
                </td>
                <td class="py-2 px-2 text-center whitespace-nowrap font-mono">{{ formatDuration(a) }}</td>
              </tr>
              <tr *ngIf="activities.length === 0">
                <td colspan="5" class="py-8 text-center text-gray-500">No activities found</td>
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
  `
})
export class OverviewComponent implements OnInit, OnDestroy {
  activities: any[] = [];
  breakdown: BreakdownItem[] = [];
  status: Status | null = null;
  maxSec = 1;

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
    });

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
    });
  }

  loadSummary() {
    this.api.getBreakdown().subscribe(b => {
      this.breakdown = b;
      this.maxSec = Math.max(1, ...b.map(x => x.total_sec));
    });
    this.api.getStatus().subscribe(s => this.status = s);
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
}
