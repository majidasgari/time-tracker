import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import * as echarts from 'echarts/core';
import { PieChart } from 'echarts/charts';
import {
  TitleComponent, TooltipComponent, LegendComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { ApiService, AccumulatedItem, CategoryOut } from '../../services/api.service';
import { DateTimeInputComponent } from '../../shared/date-input.component';
import { Subject, forkJoin, takeUntil, debounceTime } from 'rxjs';

echarts.use([PieChart, TitleComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

// -------------------------------------------------------
// Colour palette
// -------------------------------------------------------
const PALETTE = [
  '#6366f1','#22d3ee','#f59e0b','#10b981','#f43f5e',
  '#a855f7','#fb923c','#34d399','#38bdf8','#fbbf24',
  '#e879f9','#4ade80','#f87171','#60a5fa','#facc15',
  '#c084fc','#2dd4bf','#fb7185','#a3e635','#818cf8',
];

// -------------------------------------------------------
// Preset ranges
// -------------------------------------------------------
type Preset = 'today' | 'week' | 'month' | 'custom';

function presetRange(p: Preset): [string, string] {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const isoLocal = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  if (p === 'today') {
    const start = new Date(now); start.setHours(0,0,0,0);
    return [isoLocal(start), isoLocal(now)];
  }
  if (p === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay()); start.setHours(0,0,0,0);
    return [isoLocal(start), isoLocal(now)];
  }
  if (p === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return [isoLocal(start), isoLocal(now)];
  }
  return ['', ''];
}

function makePieOption(title: string, data: AccumulatedItem[], colorMap?: Record<string, string>) {
  const items = data.map((d, i) => {
    const color = colorMap?.[d.label] || PALETTE[i % PALETTE.length];
    return {
      name: d.label,
      value: d.total_sec,
      itemStyle: { color },
    };
  });
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => {
        const s = p.value as number;
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        const dur = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
        return `<b>${p.name}</b><br/>${dur} (${p.percent}%)`;
      },
    },
    series: [{
      name: title,
      type: 'pie',
      radius: ['42%', '72%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: '#1e293b', borderWidth: 2 },
      label: { show: false },
      labelLine: { show: false },
      emphasis: {
        label: { show: true, fontSize: 13, fontWeight: 'bold', color: '#fff' },
        itemStyle: { shadowBlur: 12, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,.5)' },
      },
      data: items,
    }],
  };
}

@Component({
  selector: 'app-charts',
  standalone: true,
  imports: [CommonModule, FormsModule, NgxEchartsDirective, DateTimeInputComponent],
  providers: [provideEchartsCore({ echarts })],
  template: `
    <div class="space-y-6">
      <h1 class="text-2xl font-bold">Time Charts</h1>

        <!-- Range picker -->
      <div class="bg-gray-800 rounded-xl p-5 flex flex-wrap items-center gap-3">
        <div class="flex gap-2 flex-wrap">
          <button *ngFor="let p of presets" (click)="selectPreset(p.key)"
            [class]="'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ' +
              (activePreset === p.key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600')">
            {{ p.label }}
          </button>
        </div>

        <div class="flex items-center gap-2 ml-auto flex-wrap">
          <span class="text-gray-400 text-sm">From</span>
          <app-datetime-input [(ngModel)]="fromInput"
            (ngModelChange)="onCustomRange()"
            placeholder="From..."
          />
          <span class="text-gray-400 text-sm">To</span>
          <app-datetime-input [(ngModel)]="toInput"
            (ngModelChange)="onCustomRange()"
            placeholder="To..."
          />
        </div>

        <!-- Text filters -->
        <div class="w-full grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
          <input id="chart-filter-category" type="text" placeholder="Filter category…"
            [(ngModel)]="filterCategory" (ngModelChange)="onTextFilter()"
            class="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"/>
          <input id="chart-filter-process" type="text" placeholder="Filter process…"
            [(ngModel)]="filterProcess" (ngModelChange)="onTextFilter()"
            class="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"/>
          <input id="chart-filter-title" type="text" placeholder="Filter window title…"
            [(ngModel)]="filterTitle" (ngModelChange)="onTextFilter()"
            class="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"/>
        </div>

        <!-- Active filters -->
        <div *ngIf="filterCategory || filterProcess || filterTitle" class="w-full flex flex-wrap items-center gap-2">
          <span class="text-xs text-indigo-300">Active filters:</span>
          <span *ngIf="filterCategory" class="text-xs px-2 py-0.5 rounded bg-indigo-900/50 text-indigo-300 flex items-center gap-1">
            category: {{ filterCategory }}
            <button (click)="filterCategory = ''; onTextFilter()" class="text-gray-500 hover:text-white">&times;</button>
          </span>
          <span *ngIf="filterProcess" class="text-xs px-2 py-0.5 rounded bg-indigo-900/50 text-indigo-300 flex items-center gap-1">
            process: {{ filterProcess }}
            <button (click)="filterProcess = ''; onTextFilter()" class="text-gray-500 hover:text-white">&times;</button>
          </span>
          <span *ngIf="filterTitle" class="text-xs px-2 py-0.5 rounded bg-indigo-900/50 text-indigo-300 flex items-center gap-1">
            title: {{ filterTitle }}
            <button (click)="filterTitle = ''; onTextFilter()" class="text-gray-500 hover:text-white">&times;</button>
          </span>
          <button (click)="filterCategory = ''; filterProcess = ''; filterTitle = ''; onTextFilter()"
            class="text-xs text-gray-500 hover:text-gray-300 underline">Clear all</button>
        </div>

        <!-- Total in range -->
        <div class="w-full flex gap-6 text-sm text-gray-300" *ngIf="totalSec > 0">
          <span>Total: <b class="text-white">{{ formatTotal(totalSec) }}</b></span>
        </div>
      </div>
      <!-- Charts grid -->
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4" *ngIf="!loading; else spinnerTpl">


        <!-- By Category -->
        <div class="bg-gray-800 rounded-xl p-5">
          <h2 class="text-base font-semibold mb-3 text-indigo-300">By Category</h2>
          <div *ngIf="catData.length" echarts [options]="catOption" (chartClick)="onCatClick($event)" class="h-64 w-full"></div>
          <!-- Table -->
          <div class="mt-3 space-y-1 text-sm max-h-48 overflow-y-auto">
            <div *ngFor="let d of catData; let i = index"
              class="flex items-center gap-2 cursor-pointer hover:bg-gray-700/30 rounded px-1 py-0.5 transition-colors"
              (click)="filterCategory = d.label; onTextFilter()">
              <span class="w-3 h-3 rounded-full flex-shrink-0" [style.background]="categoryColor(d.label)"></span>
              <span class="flex-1 truncate text-gray-300" [title]="d.label">{{ d.label }}</span>
              <span class="font-mono text-gray-400">{{ fmt(d.total_sec) }}</span>
              <span class="text-gray-500 w-10 text-right">{{ pct(d.total_sec, catData) }}%</span>
            </div>
          </div>
        </div>

        <!-- By Process -->
        <div class="bg-gray-800 rounded-xl p-5">
          <h2 class="text-base font-semibold mb-3 text-cyan-300">By Process</h2>
          <div *ngIf="procData.length" echarts [options]="procOption" (chartClick)="onProcClick($event)" class="h-64 w-full"></div>
          <div class="mt-3 space-y-1 text-sm max-h-48 overflow-y-auto">
            <div *ngFor="let d of procData; let i = index"
              class="flex items-center gap-2 cursor-pointer hover:bg-gray-700/30 rounded px-1 py-0.5 transition-colors"
              (click)="filterProcess = d.label; onTextFilter()">
              <span class="w-3 h-3 rounded-full flex-shrink-0" [style.background]="color(i)"></span>
              <span class="flex-1 truncate text-gray-300" [title]="d.label">{{ d.label }}</span>
              <span class="font-mono text-gray-400">{{ fmt(d.total_sec) }}</span>
              <span class="text-gray-500 w-10 text-right">{{ pct(d.total_sec, procData) }}%</span>
              <button (click)="$event.stopPropagation(); openCategorize('process', d.label)"
                class="text-gray-600 hover:text-indigo-400 text-xs px-1" title="Add to category">+</button>
            </div>
          </div>
        </div>

        <!-- By Title -->
        <div class="bg-gray-800 rounded-xl p-5">
          <h2 class="text-base font-semibold mb-3 text-amber-300">By Title (top 20)</h2>
          <div *ngIf="titleData.length" echarts [options]="titleOption" (chartClick)="onTitleClick($event)" class="h-64 w-full"></div>
          <div class="mt-3 space-y-1 text-sm max-h-48 overflow-y-auto">
            <div *ngFor="let d of titleData; let i = index"
              class="flex items-center gap-2 cursor-pointer hover:bg-gray-700/30 rounded px-1 py-0.5 transition-colors"
              (click)="filterTitle = d.label; onTextFilter()">
              <span class="w-3 h-3 rounded-full flex-shrink-0" [style.background]="color(i)"></span>
              <span class="flex-1 truncate text-gray-300" [title]="d.label">{{ d.label }}</span>
              <span class="font-mono text-gray-400">{{ fmt(d.total_sec) }}</span>
              <span class="text-gray-500 w-10 text-right">{{ pct(d.total_sec, titleData) }}%</span>
              <button (click)="$event.stopPropagation(); openCategorize('title', d.label)"
                class="text-gray-600 hover:text-indigo-400 text-xs px-1" title="Add to category">+</button>
            </div>
          </div>
        </div>

      </div>

      <ng-template #spinnerTpl>
        <div class="flex justify-center py-16">
          <div class="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </ng-template>
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
            <p class="text-xs text-gray-500 mt-1">Will match {{ catModalType }} containing this pattern.</p>
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
  `
})
export class ChartsComponent implements OnInit, OnDestroy {
  presets = [
    { key: 'today' as Preset, label: 'Today' },
    { key: 'week'  as Preset, label: 'This Week' },
    { key: 'month' as Preset, label: 'This Month' },
    { key: 'custom' as Preset, label: 'Custom' },
  ];
  activePreset: Preset = 'today';

  fromInput = '';
  toInput   = '';

  loading = false;
  catData:   AccumulatedItem[] = [];
  procData:  AccumulatedItem[] = [];
  titleData: AccumulatedItem[] = [];

  catOption:   any = {};
  procOption:  any = {};
  titleOption: any = {};

  categoryColors: Record<string, string> = {};

  // Categorize dialog
  showCatModal = false;
  catModalType: 'process' | 'title' = 'process';
  catModalValue = '';
  catModalRegex = '';
  catModalCategoryId: number | null = null;
  categories: CategoryOut[] = [];

  // Text filters
  filterCategory = '';
  filterProcess  = '';
  filterTitle    = '';

  get totalSec() {
    const sum = (arr: AccumulatedItem[]) => arr.reduce((a, b) => a + b.total_sec, 0);
    return Math.max(sum(this.catData), sum(this.procData), sum(this.titleData));
  }

  private destroy  = new Subject<void>();
  private filter$  = new Subject<void>();

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.filter$.pipe(debounceTime(300), takeUntil(this.destroy)).subscribe(() => this.load());
    this.loadCategories();
    this.fetchCategories();
    this.selectPreset('today');
  }

  ngOnDestroy() { this.destroy.next(); }

  loadCategories() {
    this.api.getCategories().subscribe(cats => {
      this.categoryColors = {};
      for (const c of cats) {
        this.categoryColors[c.name] = c.color;
      }
    });
  }

  fetchCategories() {
    this.api.getCategories().subscribe(cats => this.categories = cats);
  }

  openCategorize(type: 'process' | 'title', value: string) {
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
        this.load();
      },
      error: () => {},
    });
  }

  private _escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  onCatClick(e: any) {
    if (e.name) { this.filterCategory = e.name; this.onTextFilter(); }
  }

  onProcClick(e: any) {
    if (e.name) { this.filterProcess = e.name; this.onTextFilter(); }
  }

  onTitleClick(e: any) {
    if (e.name) { this.filterTitle = e.name; this.onTextFilter(); }
  }

  onTextFilter() { this.filter$.next(); }

  selectPreset(p: Preset) {
    this.activePreset = p;
    if (p !== 'custom') {
      const [f, t] = presetRange(p);
      this.fromInput = f;
      this.toInput   = t;
      this.load();
    }
  }

  onCustomRange() {
    this.activePreset = 'custom';
    this.load();
  }

  load() {
    if (!this.fromInput || !this.toInput) return;
    const fromIso = new Date(this.fromInput).toISOString();
    const toIso   = new Date(this.toInput).toISOString();
    const fc = this.filterCategory || undefined;
    const fp = this.filterProcess  || undefined;
    const ft = this.filterTitle    || undefined;

    this.loading = true;
    forkJoin({
      cat:   this.api.getAccumulated('category', fromIso, toIso, 20, fc, fp, ft),
      proc:  this.api.getAccumulated('process',  fromIso, toIso, 20, fc, fp, ft),
      title: this.api.getAccumulated('title',    fromIso, toIso, 20, fc, fp, ft),
    }).pipe(takeUntil(this.destroy)).subscribe({
      next: ({ cat, proc, title }) => {
        this.catData   = cat;
        this.procData  = proc;
        this.titleData = title;
        this.catOption   = makePieOption('Category', cat, this.categoryColors);
        this.procOption  = makePieOption('Process',  proc);
        this.titleOption = makePieOption('Title',    title);
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  color(i: number) { return PALETTE[i % PALETTE.length]; }

  categoryColor(label: string): string {
    return this.categoryColors[label] || PALETTE[0];
  }

  pct(sec: number, arr: AccumulatedItem[]) {
    const total = arr.reduce((a, b) => a + b.total_sec, 0);
    return total ? Math.round(sec / total * 100) : 0;
  }

  fmt(sec: number): string {
    if (sec < 60)   return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec/60)}m`;
    return `${Math.floor(sec/3600)}h ${Math.floor((sec%3600)/60)}m`;
  }

  formatTotal(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
}
