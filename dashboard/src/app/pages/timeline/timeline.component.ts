import { Component, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, CategoryOut, TimelineActivity, JobOut, ScreenshotInfo } from '../../services/api.service';
import { DateTimeInputComponent } from '../../shared/date-input.component';
import { Subject, takeUntil } from 'rxjs';

const ROW_H = 64;
const ROW_GAP = 5;
const HEADER_H = 48;
const LEFT_W = 110;
const BODY_PAD = 6;
const JOB_PALETTE = [
  '#f59e0b', '#10b981', '#6366f1', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6',
  '#3b82f6', '#a855f7', '#e11d48', '#0ea5e9', '#65a30d',
  '#d946ef', '#0284c7', '#ca8a04', '#16a34a', '#dc2626',
];
const MIN_VIEW_MS = 60_000;
const MAX_VIEW_MS = 7 * 86400000;

const ROW_LABELS = ['Process', 'Title', 'Category', 'Job'];
const ROW_KEYS: Array<keyof Pick<TimelineActivity, 'process' | 'title' | 'category' | 'job'>> =
  ['process', 'title', 'category', 'job'];

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [CommonModule, FormsModule, DateTimeInputComponent],
  template: `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">Timeline</h1>
      </div>

      <!-- Controls -->
      <div class="bg-gray-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="text-gray-400 text-sm">From</span>
          <app-datetime-input [(ngModel)]="fromInput" (ngModelChange)="onRangeChange()"
            placeholder="From..."
          />
        </div>
        <div class="flex items-center gap-2">
          <span class="text-gray-400 text-sm">To</span>
          <app-datetime-input [(ngModel)]="toInput" (ngModelChange)="onRangeChange()"
            placeholder="To..."
          />
        </div>
        <span class="text-gray-600 mx-1">|</span>
        <button *ngFor="let p of presets" (click)="applyPreset(p.minutes)"
          [class]="'px-3 py-1 rounded-lg text-xs font-medium transition-colors ' +
            (currentPreset === p.minutes ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600')">
          {{ p.label }}
        </button>
        <span class="text-gray-600 mx-1">|</span>
        <span class="text-xs text-gray-500" *ngIf="totalActivities > 0">
          {{ totalActivities }} activities &middot; {{ totalHours.toFixed(1) }}h
        </span>
      </div>

      <!-- Range bar -->
      <div class="bg-gray-800 rounded-xl px-4 py-2 flex items-center gap-3 text-xs">
        <span class="text-gray-400">Range</span>
        <span class="text-gray-500">Drag on time ruler to select</span>
        <span *ngIf="rangeCount > 0" class="text-gray-400 font-mono">{{ rangeCount }} activities in range</span>
        <button (click)="applyJobToRange()" [disabled]="rangeCount === 0"
          class="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          [class.bg-yellow-600]="rangeCount > 0"
          [class.hover:bg-yellow-500]="rangeCount > 0"
          [class.bg-gray-700]="rangeCount === 0"
          [class.text-gray-300]="rangeCount === 0"
          [class.text-white]="rangeCount > 0"
          [class.opacity-50]="rangeCount === 0"
          [class.cursor-not-allowed]="rangeCount === 0">
          Assign Job
        </button>
        <button (click)="clearRange()"
          class="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs transition-colors"
          [class.opacity-30]="rangeCount === 0">
          Clear
        </button>
      </div>

      <!-- Error -->
      <div *ngIf="errorMsg" class="bg-red-900/50 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300">
        {{ errorMsg }}
      </div>

      <!-- Loading -->
      <div *ngIf="loading" class="flex justify-center py-16">
        <div class="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <!-- Timeline + Sidebar -->
      <div class="flex gap-3">
        <!-- Canvas area -->
        <div class="flex-1 bg-gray-800 rounded-xl overflow-hidden relative" #container>
          <canvas #canvas
            class="block cursor-crosshair"
            [class.cursor-grabbing]="dragging"
            (mousedown)="onMouseDown($event)"
            (mousemove)="onMouseMove($event)"
            (mouseup)="onMouseUp()"
            (mouseleave)="onMouseUp()"
            (wheel)="onWheel($event)">
          </canvas>
          <!-- Tooltip -->
          <div *ngIf="tooltip.visible"
            class="absolute pointer-events-none z-50 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs shadow-xl"
            [style.left.px]="tooltip.x" [style.top.px]="tooltip.y"
            [style.transform]="'translate(-50%, -100%)'">
            <div class="font-semibold">{{ tooltip.process }}</div>
            <div class="text-gray-400 truncate max-w-[200px]">{{ tooltip.title }}</div>
            <div *ngIf="tooltip.job" class="text-yellow-400 text-[10px] mt-0.5">{{ tooltip.job }}</div>
            <div class="text-gray-300 mt-0.5">{{ tooltip.time }}</div>
            <div class="text-gray-300 font-mono text-[10px]">{{ tooltip.duration }}</div>
          </div>
        </div>

        <!-- Marker Sidebar -->
        <div *ngIf="markerDetail" class="w-[270px] flex-shrink-0 bg-gray-800 rounded-xl p-4 text-xs space-y-2">
          <div class="flex items-center justify-between mb-1">
            <span class="text-yellow-400 font-semibold text-sm">Marker</span>
            <button (click)="clearMarker()" class="text-gray-500 hover:text-gray-300 text-sm leading-none">&times;</button>
          </div>
          <div><div class="text-gray-500 text-[10px] uppercase">Time</div>
            <div class="text-gray-200 font-mono">{{ markerDetail.time }}</div></div>
          <div><div class="text-gray-500 text-[10px] uppercase">Process</div>
            <div class="text-gray-200 font-mono">{{ markerDetail.process }}</div></div>
          <div><div class="text-gray-500 text-[10px] uppercase">Title</div>
            <div class="text-gray-300 break-all">{{ markerDetail.title }}</div></div>
          <div><div class="text-gray-500 text-[10px] uppercase">Category</div>
            <span class="px-1.5 py-0.5 rounded text-[10px]" [style.background]="markerDetail.color">{{ markerDetail.category }}</span></div>
          <div><div class="text-gray-500 text-[10px] uppercase">Duration</div>
            <div class="text-gray-200 font-mono">{{ markerDetail.duration }}</div></div>

          <!-- Job assignment for marker -->
          <div class="pt-2 border-t border-gray-700">
            <div class="text-gray-500 text-[10px] uppercase mb-1">Job</div>
            <input [(ngModel)]="markerJobName" placeholder="Job name…"
              (ngModelChange)="onMarkerJobAutocomplete()"
              class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500" />
            <div *ngIf="markerJobSuggestions.length > 0" class="bg-gray-800 border border-gray-600 rounded mt-1 max-h-24 overflow-y-auto">
              <div *ngFor="let s of markerJobSuggestions" (click)="selectMarkerJob(s)"
                class="px-2 py-1 hover:bg-gray-700 cursor-pointer text-xs text-gray-300">{{ s.name }}</div>
            </div>
            <input [(ngModel)]="markerJobDesc" placeholder="Description…"
              class="w-full mt-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500" />
            <button (click)="saveMarkerJob()"
              class="mt-2 w-full py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-medium transition-colors">
              Save Job
            </button>
            <button *ngIf="markerActivityJob" (click)="clearMarkerJob()"
              class="mt-1 w-full py-1 rounded bg-gray-700 hover:bg-red-600 text-xs transition-colors">
              Clear Job
            </button>
          </div>

          <!-- Screenshot -->
          <div *ngIf="markerScreenshotId != null" class="pt-2 border-t border-gray-700">
            <div class="text-gray-500 text-[10px] uppercase mb-1">Screenshot</div>
            <img [src]="screenshotUrl(markerScreenshotId)"
              class="w-full rounded border border-gray-700 cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all"
              (click)="previewScreenshotId = markerScreenshotId" alt="Screenshot" />
          </div>
        </div>
      </div>

      <!-- Screenshot preview -->
      <div *ngIf="previewScreenshotId != null" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/80"
        (click)="previewScreenshotId = null">
        <img [src]="screenshotUrl(previewScreenshotId)" class="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl" alt="Preview" />
      </div>

      <!-- Legend -->
      <div *ngIf="legend.length > 0" class="bg-gray-800 rounded-xl p-4 flex flex-wrap gap-4 text-sm">
        <div *ngFor="let item of legend" class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full flex-shrink-0" [style.background]="item.color"></span>
          <span class="text-gray-300">{{ item.name }}</span>
        </div>
      </div>

      <!-- Range job dialog -->
      <div *ngIf="showRangeJobDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        (click)="showRangeJobDialog = false">
        <div class="bg-gray-800 rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl border border-gray-700" (click)="$event.stopPropagation()">
          <h2 class="text-lg font-semibold mb-4">Assign Job to Range</h2>
          <p class="text-sm text-gray-400 mb-3">{{ rangeCount }} activities in selected range</p>
          <div class="space-y-3">
            <input [(ngModel)]="rangeJobName" placeholder="Job name…"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            <input [(ngModel)]="rangeJobDesc" placeholder="Description…"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div class="flex items-center justify-end gap-3 mt-5">
            <button (click)="showRangeJobDialog = false"
              class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-colors">Cancel</button>
            <button (click)="doRangeJobAssign()"
              class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors">Assign</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`:host { display: block; } canvas { image-rendering: auto; }`]
})
export class TimelineComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  fromInput = ''; toInput = '';
  loading = false; errorMsg = '';
  totalActivities = 0; totalHours = 0;
  legend: { name: string; color: string }[] = [];
  categoryColors: Record<string, string> = {};

  presets = [
    { label: '1m',  minutes: 1 },
    { label: '2m',  minutes: 2 },
    { label: '5m',  minutes: 5 },
    { label: '15m', minutes: 15 },
    { label: '30m', minutes: 30 },
    { label: '1h',  minutes: 60 },
    { label: '3h',  minutes: 180 },
    { label: '6h',  minutes: 360 },
    { label: '12h', minutes: 720 },
    { label: '24h', minutes: 1440 },
  ];
  currentPreset = 360;

  tooltip = { visible: false, x: 0, y: 0, process: '', title: '', time: '', duration: '', job: '' };

  // Marker
  markerMs: number | null = null;
  markerActivity: TimelineActivity | null = null;
  markerDetail: any = null;
  markerScreenshotId: number | null = null;
  previewScreenshotId: number | null = null;
  markerJobName = ''; markerJobDesc = '';
  markerActivityJob: string | null = null;
  markerJobSuggestions: { name: string; description: string | null }[] = [];

  // Range selection
  rangeStartMs: number | null = null;
  rangeEndMs: number | null = null;
  rangeCount = 0;
  showRangeJobDialog = false;
  rangeJobName = ''; rangeJobDesc = '';

  private activities: TimelineActivity[] = [];
  private viewStartMs = 0; private viewEndMs = 0;
  private dataMinMs = 0; private dataMaxMs = 0;

  dragging = false;
  private _rulerDrag = false;
  private dragStartX = 0;
  private dragStartViewStart = 0;
  private dragStartViewEnd = 0;
  private _mouseDownX = 0; private _mouseDownY = 0;
  private _mouseLastX = 0; private _mouseLastY = 0;
  private resizeObs: ResizeObserver | null = null;
  private destroy = new Subject<void>();

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadCategories();
    const now = new Date(); const start = new Date(now); start.setHours(now.getHours() - 6, 0, 0, 0);
    this.setDefaultRange(now, start);
    this.onRangeChange();
  }
  ngOnDestroy() { this.destroy.next(); this.resizeObs?.disconnect(); }
  ngAfterViewInit() {
    this.resizeObs = new ResizeObserver(() => this.render());
    this.resizeObs.observe(this.containerRef.nativeElement);
  }

  loadCategories() {
    this.api.getCategories().pipe(takeUntil(this.destroy)).subscribe(cats => {
      this.categoryColors = {};
      for (const c of cats) this.categoryColors[c.name] = c.color;
    });
  }

  private setDefaultRange(now: Date, start: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    this.fromInput = fmt(start); this.toInput = fmt(now);
  }

  applyPreset(minutes: number) {
    this.currentPreset = minutes;
    if (!this.toInput) return;
    this.viewEndMs = new Date(this.toInput).getTime();
    this.viewStartMs = this.viewEndMs - minutes * 60_000;
    this.fetchAndRender();
  }

  onRangeChange() {
    if (this.fromInput && this.toInput) {
      this.currentPreset = 0;
      this.viewStartMs = new Date(this.fromInput).getTime();
      this.viewEndMs = new Date(this.toInput).getTime();
    }
    this.fetchAndRender();
  }

  fetchAndRender() {
    if (!this.fromInput || !this.toInput) return;
    const fromIso = new Date(this.fromInput).toISOString();
    const toIso = new Date(this.toInput).toISOString();
    this.loading = true;
    this.api.getTimeline(fromIso, toIso).pipe(takeUntil(this.destroy)).subscribe({
      next: (data) => {
        this.activities = data;
        this.totalActivities = data.length;
        this.totalHours = data.reduce((s, a) => s + (a.duration_sec || 0), 0) / 3600;
        this._buildLegend();
        this.computeDataRange();
        if (!this.currentPreset || this.viewEndMs === 0) {
          // Center around current time with 3h span
          const nowMs = Date.now();
          const span = 3 * 3600_000;
          this.viewEndMs = nowMs + span / 2 + 60_000;
          this.viewStartMs = nowMs - span / 2;
        }
        const nowMs = Date.now();
        if (this.viewEndMs < nowMs) this.viewEndMs = nowMs + 60_000;
        this.loading = false;
        this.render();
      },
      error: (err) => { this.errorMsg = err?.error?.detail || 'Failed to load'; this.loading = false; },
    });
  }

  private _buildLegend() {
    const seen = new Set<string>(); this.legend = [];
    for (const a of this.activities) {
      const name = a.category || 'Uncategorized';
      if (!seen.has(name)) { seen.add(name); this.legend.push({ name, color: this.getColor(name) }); }
    }
  }

  private computeDataRange() {
    if (this.activities.length === 0) {
      this.dataMinMs = this.viewStartMs || Date.now() - 3600000;
      this.dataMaxMs = this.dataMinMs + 3600000; return;
    }
    this.dataMinMs = Infinity; this.dataMaxMs = -Infinity;
    for (const a of this.activities) {
      const s = new Date(a.start_ts).getTime(); this.dataMinMs = Math.min(this.dataMinMs, s);
      const e = a.end_ts ? new Date(a.end_ts).getTime() : s + (a.duration_sec || 0) * 1000;
      this.dataMaxMs = Math.max(this.dataMaxMs, e);
    }
    if (!isFinite(this.dataMinMs)) { this.dataMinMs = Date.now() - 3600000; this.dataMaxMs = Date.now(); }
  }
  getColor(cat: string): string { return this.categoryColors[cat] || '#555555'; }

  getJobColor(job: string | null): string {
    if (!job) return 'rgba(107, 114, 128, 0.3)';
    let hash = 0;
    for (let i = 0; i < job.length; i++) hash = ((hash << 5) - hash + job.charCodeAt(i)) | 0;
    return JOB_PALETTE[Math.abs(hash) % JOB_PALETTE.length];
  }

  screenshotUrl(id: number): string { return this.api.getScreenshotImageUrl(id); }

  // ── Render ─────────────────────────────────────────────────

  render() {
    const canvas = this.canvasRef.nativeElement;
    const container = this.containerRef.nativeElement;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const numRows = ROW_LABELS.length;
    const totalH = HEADER_H + numRows * (ROW_H + ROW_GAP) + BODY_PAD;

    canvas.width = w * (window.devicePixelRatio || 1);
    canvas.height = totalH * (window.devicePixelRatio || 1);
    canvas.style.width = w + 'px'; canvas.style.height = totalH + 'px';

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, w, totalH);
    ctx.fillStyle = '#1f2937'; ctx.fillRect(0, 0, w, totalH);

    if (this.activities.length === 0 || this.viewEndMs <= this.viewStartMs) {
      ctx.fillStyle = '#9ca3af'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('No data in this range', w / 2, totalH / 2); return;
    }

    const tx = LEFT_W;
    const tw = w - LEFT_W - BODY_PAD;
    const viewMs = this.viewEndMs - this.viewStartMs;

    // Time ruler
    this.drawTimeRuler(ctx, tx, tw, viewMs);

    // Range selection highlight
    if (this.rangeStartMs != null && this.rangeEndMs != null) {
      const r1 = tx + ((Math.min(this.rangeStartMs, this.rangeEndMs) - this.viewStartMs) / viewMs) * tw;
      const r2 = tx + ((Math.max(this.rangeStartMs, this.rangeEndMs) - this.viewStartMs) / viewMs) * tw;
      ctx.fillStyle = 'rgba(251, 191, 36, 0.12)';
      ctx.fillRect(r1, HEADER_H, r2 - r1, totalH - HEADER_H);
    }

    // Row labels
    ctx.font = '12px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i < numRows; i++) {
      const y = HEADER_H + i * (ROW_H + ROW_GAP);
      ctx.fillStyle = i % 2 === 0 ? '#1e293b' : '#1a2332';
      ctx.fillRect(0, y, w, ROW_H);
      ctx.fillStyle = '#6b7280'; ctx.fillText(ROW_LABELS[i], LEFT_W - 8, y + ROW_H / 2);
      ctx.strokeStyle = '#374151'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(LEFT_W, y); ctx.lineTo(LEFT_W, y + ROW_H); ctx.stroke();
    }

    // Activity bars per row
    for (const a of this.activities) {
      const startMs = new Date(a.start_ts).getTime();
      const endMs = a.end_ts ? new Date(a.end_ts).getTime() : startMs + (a.duration_sec || 0) * 1000;
      const x1 = tx + ((startMs - this.viewStartMs) / viewMs) * tw;
      const x2 = tx + ((endMs - this.viewStartMs) / viewMs) * tw;
      const cx1 = Math.max(tx, x1); const cx2 = Math.min(tx + tw, x2);
      if (cx2 <= cx1) continue;

      const color = this.getColor(a.category || 'Uncategorized');
      const segW = cx2 - cx1;

      for (let ri = 0; ri < numRows; ri++) {
        const y = HEADER_H + ri * (ROW_H + ROW_GAP);
        const barY = y + 3; const barH = ROW_H - 6;

        if (ROW_KEYS[ri] === 'job') {
          ctx.fillStyle = this.getJobColor(a.job);
        } else {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.65;
        }
        ctx.fillRect(cx1, barY, segW, barH);
        ctx.globalAlpha = 1;

        // Border
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.3;
        ctx.strokeRect(cx1, barY, segW, barH);

        // Label on wide segments
        if (segW > 40) {
          let label: string | null = null;
          if (ROW_KEYS[ri] === 'process') { label = (a.process || '?').slice(0, Math.floor(segW / 7)); }
          else if (ROW_KEYS[ri] === 'title') { label = (a.title || '?').slice(0, Math.floor(segW / 7)); }
          else if (ROW_KEYS[ri] === 'category') { label = (a.category || '?').slice(0, Math.floor(segW / 8)); }
          else if (ROW_KEYS[ri] === 'job') { label = a.job ? a.job.slice(0, Math.floor(segW / 7)) : null; }

          if (label) {
            ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.8;
            ctx.fillText(label, cx1 + 3, barY + barH / 2);
            ctx.globalAlpha = 1;
          }
        }
      }
    }

    // Marker line
    if (this.markerMs != null && this.markerMs >= this.viewStartMs && this.markerMs <= this.viewEndMs) {
      const mx = tx + ((this.markerMs - this.viewStartMs) / viewMs) * tw;
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.setLineDash([6, 3]);
      ctx.beginPath(); ctx.moveTo(mx, BODY_PAD); ctx.lineTo(mx, totalH - BODY_PAD); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath(); ctx.moveTo(mx, BODY_PAD); ctx.lineTo(mx - 5, BODY_PAD - 8); ctx.lineTo(mx + 5, BODY_PAD - 8); ctx.closePath(); ctx.fill();
    }

    // Now indicator
    const nowMs = Date.now();
    if (nowMs >= this.viewStartMs && nowMs <= this.viewEndMs) {
      const nx = tx + ((nowMs - this.viewStartMs) / viewMs) * tw;
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(nx, BODY_PAD); ctx.lineTo(nx, totalH - BODY_PAD); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(nx, BODY_PAD + 4, 5, 0, Math.PI * 2); ctx.fill();
    }
  }

  private drawTimeRuler(ctx: CanvasRenderingContext2D, x: number, w: number, viewMs: number) {
    ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, x + w + BODY_PAD, HEADER_H);
    const idealTickPx = 80;
    const intervals = [1000, 5000, 10000, 30000, 60000, 300000, 600000, 900000, 1800000, 3600000, 7200000, 14400000, 43200000, 86400000, 172800000];
    let tickMs = intervals[0];
    for (const iv of intervals) { tickMs = iv; if ((tickMs / viewMs) * w >= idealTickPx) break; }
    const firstTick = Math.ceil(this.viewStartMs / tickMs) * tickMs;
    ctx.fillStyle = '#9ca3af'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let t = firstTick; t <= this.viewEndMs; t += tickMs) {
      const tx = x + ((t - this.viewStartMs) / viewMs) * w;
      ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(tx, HEADER_H - 14); ctx.lineTo(tx, HEADER_H - 4); ctx.stroke();
      const d = new Date(t);
      const hh = String(d.getHours()).padStart(2, '0'); const mm = String(d.getMinutes()).padStart(2, '0');
      const label = tickMs < 60000 ? `${hh}:${mm}:${String(d.getSeconds()).padStart(2, '0')}` :
        tickMs < 86400000 ? `${hh}:${mm}` : `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
      ctx.fillText(label, tx, HEADER_H - 14 - 12);
    }
  }

  // ── Mouse ────────────────────────────────────────────────

  private msFromX(clientX: number): number {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = clientX - rect.left - LEFT_W;
    const tw = rect.width - LEFT_W - BODY_PAD;
    return this.viewStartMs + Math.max(0, Math.min(1, x / tw)) * (this.viewEndMs - this.viewStartMs);
  }

  onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const my = e.clientY - rect.top;

    if (my < HEADER_H) {
      // Range selection on time ruler
      this._rulerDrag = true;
      this.rangeStartMs = this.msFromX(e.clientX);
      this.rangeEndMs = null;
      this.rangeCount = 0;
      this.tooltip.visible = false;
      this.render();
      return;
    }

    this.dragging = true;
    this._rulerDrag = false;
    this.dragStartX = e.clientX;
    this.dragStartViewStart = this.viewStartMs;
    this.dragStartViewEnd = this.viewEndMs;
    this.tooltip.visible = false;
    this._mouseDownX = e.clientX; this._mouseDownY = e.clientY;
    this._mouseLastX = e.clientX; this._mouseLastY = e.clientY;
  }

  onMouseMove(e: MouseEvent) {
    this._mouseLastX = e.clientX; this._mouseLastY = e.clientY;
    if (this._rulerDrag) {
      if (this.rangeStartMs != null) {
        this.rangeEndMs = this.msFromX(e.clientX);
        this._computeRangeCount();
        this.render();
      }
      return;
    }
    if (this.dragging) {
      const dx = e.clientX - this.dragStartX;
      const rect = this.canvasRef.nativeElement.getBoundingClientRect();
      const tw = rect.width - LEFT_W - BODY_PAD;
      const msPerPx = (this.dragStartViewEnd - this.dragStartViewStart) / tw;
      this.viewStartMs = this.dragStartViewStart - dx * msPerPx;
      this.viewEndMs = this.dragStartViewEnd - dx * msPerPx;
      this.render(); return;
    }

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const tw = rect.width - LEFT_W - BODY_PAD;
    if (mx < LEFT_W || mx > LEFT_W + tw) { this.tooltip.visible = false; return; }

    const hoverMs = this.msFromX(e.clientX);
    let best: TimelineActivity | null = null; let bestStartMs = 0;
    for (const a of this.activities) {
      const as = new Date(a.start_ts).getTime();
      const ae = a.end_ts ? new Date(a.end_ts).getTime() : as + (a.duration_sec || 0) * 1000;
      if (hoverMs >= as && hoverMs <= ae && as >= bestStartMs) { best = a; bestStartMs = as; }
    }

    if (best) {
      const dur = best.duration_sec || 0;
      const durStr = dur < 60 ? `${dur}s` : dur < 3600 ? `${Math.floor(dur / 60)}m ${dur % 60}s` : `${Math.floor(dur / 3600)}h ${Math.floor((dur % 3600) / 60)}m`;
      const d = new Date(hoverMs);
      const timeStr = `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      this.tooltip = { visible: true, x: e.clientX - rect.left, y: e.clientY - rect.top - 8,
        process: best.process || '?', title: (best.title || '—').slice(0, 60), time: timeStr, duration: durStr,
        job: best.job || '' };
    } else { this.tooltip.visible = false; }
  }

  onMouseUp() {
    if (this._rulerDrag) {
      this._rulerDrag = false;
      if (this.rangeStartMs != null && this.rangeEndMs == null) {
        // Single click on ruler: just place marker
        this.placeMarker(this.msFromX(this._mouseLastX));
        this.rangeStartMs = null;
      } else if (this.rangeStartMs != null && this.rangeEndMs != null) {
        this._computeRangeCount();
      }
      this.render();
      return;
    }

    if (this.dragging &&
      Math.abs(this._mouseDownX - this._mouseLastX) < 4 &&
      Math.abs(this._mouseDownY - this._mouseLastY) < 4) {
      this.placeMarker(this._mouseLastX);
    }
    this.dragging = false;
  }

  onWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.3 : 1 / 1.3;
    const viewMs = this.viewEndMs - this.viewStartMs;
    let newViewMs = Math.max(MIN_VIEW_MS, Math.min(MAX_VIEW_MS, viewMs * zoomFactor));
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const tw = rect.width - LEFT_W - BODY_PAD;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left - LEFT_W) / tw));
    const centerMs = this.viewStartMs + ratio * viewMs;
    this.viewStartMs = centerMs - newViewMs * ratio;
    this.viewEndMs = this.viewStartMs + newViewMs;
    this.tooltip.visible = false; this.render();
  }

  // ── Marker ───────────────────────────────────────────────

  private placeMarker(clientX: number) {
    const ms = this.msFromX(clientX);
    this.markerMs = ms;
    this.rangeStartMs = ms; this.rangeEndMs = null; this.rangeCount = 0;
    this.markerScreenshotId = null; this.markerJobName = ''; this.markerJobDesc = ''; this.markerActivityJob = null;
    this._computeMarkerDetail(ms);
    this.render();

    const ts = new Date(ms).toISOString();
    this.api.getScreenshotNear(ts).pipe(takeUntil(this.destroy)).subscribe(shot => {
      if (shot) this.markerScreenshotId = shot.id;
    });
  }

  private _computeMarkerDetail(ms: number) {
    let best: TimelineActivity | null = null; let bestStartMs = 0;
    for (const a of this.activities) {
      const as = new Date(a.start_ts).getTime();
      const ae = a.end_ts ? new Date(a.end_ts).getTime() : as + (a.duration_sec || 0) * 1000;
      if (ms >= as && ms <= ae && as >= bestStartMs) { best = a; bestStartMs = as; }
    }
    this.markerActivity = best;
    if (best) {
      const dur = best.duration_sec || 0;
      const durStr = dur < 60 ? `${dur}s` : dur < 3600 ? `${Math.floor(dur / 60)}m ${dur % 60}s` : `${Math.floor(dur / 3600)}h ${Math.floor((dur % 3600) / 60)}m`;
      const d = new Date(ms);
      const timeStr = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      const cat = best.category || 'Uncategorized';
      this.markerDetail = { process: best.process || '?', title: best.title || '—', category: cat, time: timeStr, duration: durStr, color: this.getColor(cat) };
      this.markerActivityJob = best.job || null;
      this.markerJobName = best.job || '';
      this.markerJobDesc = best.job_description || '';
    } else {
      const d = new Date(ms);
      const timeStr = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      this.markerDetail = { process: '—', title: 'No activity', category: '—', time: timeStr, duration: '—', color: '#555' };
      this.markerActivityJob = null;
    }
  }

  clearRange() {
    this.rangeStartMs = null; this.rangeEndMs = null; this.rangeCount = 0;
    this.render();
  }

  clearMarker() {
    this.markerMs = null; this.markerDetail = null; this.markerScreenshotId = null;
    this.rangeStartMs = null; this.rangeEndMs = null; this.rangeCount = 0;
    this.render();
  }

  onMarkerJobAutocomplete() {
    if (!this.markerJobName) { this.markerJobSuggestions = []; return; }
    this.api.jobAutocomplete(this.markerJobName).subscribe(s => this.markerJobSuggestions = s);
  }

  selectMarkerJob(s: { name: string; description: string | null }) {
    this.markerJobName = s.name; this.markerJobDesc = s.description || ''; this.markerJobSuggestions = [];
  }

  saveMarkerJob() {
    if (!this.markerActivity || !this.markerJobName) return;
    const j = this.markerJobName; const d = this.markerJobDesc || null;
    this.api.assignActivityJob(this.markerActivity.id, j, d).subscribe(() => {
      this.api.saveJob({ name: j, description: d }).subscribe();
      this.markerActivity!.job = j; this.markerActivity!.job_description = d;
      this.markerActivityJob = j;
      this.render();
    });
  }

  clearMarkerJob() {
    if (!this.markerActivity) return;
    this.api.assignActivityJob(this.markerActivity.id, null, null).subscribe(() => {
      this.markerActivity!.job = null; this.markerActivity!.job_description = null;
      this.markerActivityJob = null; this.markerJobName = ''; this.markerJobDesc = '';
      this.render();
    });
  }

  // ── Range ────────────────────────────────────────────────

  private _computeRangeCount() {
    if (this.rangeStartMs == null || this.rangeEndMs == null) { this.rangeCount = 0; return; }
    const r1 = Math.min(this.rangeStartMs, this.rangeEndMs);
    const r2 = Math.max(this.rangeStartMs, this.rangeEndMs);
    this.rangeCount = this.activities.filter(a => {
      const as = new Date(a.start_ts).getTime();
      const ae = a.end_ts ? new Date(a.end_ts).getTime() : as + (a.duration_sec || 0) * 1000;
      return ae >= r1 && as <= r2;
    }).length;
  }

  applyJobToRange() {
    this.showRangeJobDialog = true;
  }

  doRangeJobAssign() {
    if (this.rangeStartMs == null || this.rangeEndMs == null) return;
    const r1 = Math.min(this.rangeStartMs, this.rangeEndMs);
    const r2 = Math.max(this.rangeStartMs, this.rangeEndMs);
    const j = this.rangeJobName || null; const d = this.rangeJobDesc || null;
    let done = 0; const total = this.rangeCount;
    const acts = this.activities.filter(a => {
      const as = new Date(a.start_ts).getTime();
      const ae = a.end_ts ? new Date(a.end_ts).getTime() : as + (a.duration_sec || 0) * 1000;
      return ae >= r1 && as <= r2;
    });
    const next = () => {
      if (done >= acts.length) {
        this.showRangeJobDialog = false;
        if (j) this.api.saveJob({ name: j, description: d }).subscribe();
        // Reload to refresh
        for (const a of acts) { a.job = j; a.job_description = d; }
        this.render();
        return;
      }
      this.api.assignActivityJob(acts[done].id, j, d).subscribe({ next: () => { done++; next(); }, error: () => { done++; next(); } });
    };
    next();
  }
}
