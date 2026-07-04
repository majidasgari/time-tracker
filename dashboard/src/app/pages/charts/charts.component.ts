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
import { ApiService, AccumulatedItem } from '../../services/api.service';
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

function makePieOption(title: string, data: AccumulatedItem[]) {
  const items = data.map((d, i) => ({
    name: d.label,
    value: d.total_sec,
    itemStyle: { color: PALETTE[i % PALETTE.length] },
  }));
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
  imports: [CommonModule, FormsModule, NgxEchartsDirective],
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
          <input type="datetime-local" [(ngModel)]="fromInput"
            (ngModelChange)="onCustomRange()"
            class="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"/>
          <span class="text-gray-400 text-sm">To</span>
          <input type="datetime-local" [(ngModel)]="toInput"
            (ngModelChange)="onCustomRange()"
            class="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"/>
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

        <!-- Total in range -->
        <div class="w-full flex gap-6 text-sm text-gray-300" *ngIf="totalSec > 0">
          <span>Total: <b class="text-white">{{ formatTotal(totalSec) }}</b></span>
        </div>
      </div>

      <!-- Charts grid -->
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4" *ngIf="!loading; else spinner">

        <!-- By Category -->
        <div class="bg-gray-800 rounded-xl p-5">
          <h2 class="text-base font-semibold mb-3 text-indigo-300">By Category</h2>
          <div *ngIf="catData.length; else noData"
            echarts [options]="catOption" class="h-64 w-full">
          </div>
          <!-- Table -->
          <div class="mt-3 space-y-1 text-sm max-h-48 overflow-y-auto">
            <div *ngFor="let d of catData; let i = index"
              class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full flex-shrink-0" [style.background]="color(i)"></span>
              <span class="flex-1 truncate text-gray-300" [title]="d.label">{{ d.label }}</span>
              <span class="font-mono text-gray-400">{{ fmt(d.total_sec) }}</span>
              <span class="text-gray-500 w-10 text-right">{{ pct(d.total_sec, catData) }}%</span>
            </div>
          </div>
        </div>

        <!-- By Process -->
        <div class="bg-gray-800 rounded-xl p-5">
          <h2 class="text-base font-semibold mb-3 text-cyan-300">By Process</h2>
          <div *ngIf="procData.length; else noData"
            echarts [options]="procOption" class="h-64 w-full">
          </div>
          <div class="mt-3 space-y-1 text-sm max-h-48 overflow-y-auto">
            <div *ngFor="let d of procData; let i = index"
              class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full flex-shrink-0" [style.background]="color(i)"></span>
              <span class="flex-1 truncate text-gray-300" [title]="d.label">{{ d.label }}</span>
              <span class="font-mono text-gray-400">{{ fmt(d.total_sec) }}</span>
              <span class="text-gray-500 w-10 text-right">{{ pct(d.total_sec, procData) }}%</span>
            </div>
          </div>
        </div>

        <!-- By Title -->
        <div class="bg-gray-800 rounded-xl p-5">
          <h2 class="text-base font-semibold mb-3 text-amber-300">By Title (top 20)</h2>
          <div *ngIf="titleData.length; else noData"
            echarts [options]="titleOption" class="h-64 w-full">
          </div>
          <div class="mt-3 space-y-1 text-sm max-h-48 overflow-y-auto">
            <div *ngFor="let d of titleData; let i = index"
              class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full flex-shrink-0" [style.background]="color(i)"></span>
              <span class="flex-1 truncate text-gray-300" [title]="d.label">{{ d.label }}</span>
              <span class="font-mono text-gray-400">{{ fmt(d.total_sec) }}</span>
              <span class="text-gray-500 w-10 text-right">{{ pct(d.total_sec, titleData) }}%</span>
            </div>
          </div>
        </div>

      </div>

      <ng-template #spinner>
        <div class="flex justify-center py-16">
          <div class="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </ng-template>

      <ng-template #noData>
        <div class="flex items-center justify-center h-32 text-gray-500 text-sm">No data in this range</div>
      </ng-template>
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
    this.selectPreset('today');
  }

  ngOnDestroy() { this.destroy.next(); }

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
        this.catOption   = makePieOption('Category', cat);
        this.procOption  = makePieOption('Process',  proc);
        this.titleOption = makePieOption('Title',    title);
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  color(i: number) { return PALETTE[i % PALETTE.length]; }

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
