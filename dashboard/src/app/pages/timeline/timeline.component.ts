import { Component, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, CategoryOut, TimelineActivity } from '../../services/api.service';
import { Subject, takeUntil } from 'rxjs';

const LANE_H = 26;
const LANE_GAP = 3;
const HEADER_H = 56;
const INTEGRATED_H = 48;
const LEFT_W = 130;
const PAD = 12;
const MIN_VIEW_MS = 60_000;       // 1 minute
const MAX_VIEW_MS = 7 * 86400000; // 7 days

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">Timeline</h1>
      </div>

      <!-- Controls -->
      <div class="bg-gray-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="text-gray-400 text-sm">From</span>
          <input type="datetime-local" [(ngModel)]="fromInput" (ngModelChange)="onRangeChange()"
            class="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"/>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-gray-400 text-sm">To</span>
          <input type="datetime-local" [(ngModel)]="toInput" (ngModelChange)="onRangeChange()"
            class="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"/>
        </div>
        <span class="text-gray-600 mx-1">|</span>
        <button *ngFor="let p of presets" (click)="applyPreset(p.minutes)"
          [class]="'px-3 py-1 rounded-lg text-xs font-medium transition-colors ' +
            (currentPreset === p.minutes ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600')">
          {{ p.label }}
        </button>
        <span class="text-gray-600 mx-1">|</span>
        <span class="text-xs text-gray-500" *ngIf="totalActivities > 0">
          {{ totalActivities }} activities &middot;
          {{ totalHours.toFixed(1) }}h total
        </span>
      </div>

      <!-- Error -->
      <div *ngIf="errorMsg" class="bg-red-900/50 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300">
        {{ errorMsg }}
      </div>

      <!-- Loading -->
      <div *ngIf="loading" class="flex justify-center py-16">
        <div class="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <!-- Canvas -->
      <div class="bg-gray-800 rounded-xl overflow-hidden relative" #container>
        <canvas #canvas
          class="block w-full cursor-crosshair"
          [class.cursor-grabbing]="dragging"
          (mousedown)="onMouseDown($event)"
          (mousemove)="onMouseMove($event)"
          (mouseup)="onMouseUp()"
          (mouseleave)="onMouseUp()"
          (wheel)="onWheel($event)">
        </canvas>

        <!-- Marker info panel -->
        <div *ngIf="markerDetail" class="absolute top-3 right-3 z-40 bg-gray-900/95 border border-yellow-600/50 rounded-lg px-4 py-3 text-xs shadow-xl backdrop-blur min-w-[200px]">
          <div class="flex items-center justify-between mb-2">
            <span class="text-yellow-400 font-semibold text-xs">Marker</span>
            <button (click)="markerMs = null; markerDetail = null; render()"
              class="text-gray-500 hover:text-gray-300 text-xs leading-none">&times;</button>
          </div>
          <div class="space-y-1.5">
            <div>
              <div class="text-gray-500 text-[10px] uppercase">Time</div>
              <div class="text-gray-200 font-mono text-xs">{{ markerDetail.time }}</div>
            </div>
            <div>
              <div class="text-gray-500 text-[10px] uppercase">Process</div>
              <div class="text-gray-200 font-mono text-xs">{{ markerDetail.process }}</div>
            </div>
            <div>
              <div class="text-gray-500 text-[10px] uppercase">Title</div>
              <div class="text-gray-300 text-xs break-all max-w-[260px]">{{ markerDetail.title }}</div>
            </div>
            <div>
              <div class="text-gray-500 text-[10px] uppercase">Category</div>
              <span class="px-1.5 py-0.5 rounded text-xs" [style.background]="markerDetail.color">{{ markerDetail.category }}</span>
            </div>
            <div>
              <div class="text-gray-500 text-[10px] uppercase">Duration</div>
              <div class="text-gray-200 font-mono text-xs">{{ markerDetail.duration }}</div>
            </div>
          </div>
        </div>

        <!-- Tooltip -->
        <div *ngIf="tooltip.visible"
          class="absolute pointer-events-none z-50 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs shadow-xl"
          [style.left.px]="tooltip.x"
          [style.top.px]="tooltip.y"
          [style.transform]="tooltip.below ? 'translate(-50%, 8px)' : 'translate(-50%, -100%)'">
          <div class="font-semibold">{{ tooltip.process }}</div>
          <div class="text-gray-400">{{ tooltip.title }}</div>
          <div class="text-gray-300 mt-1">
            <span class="px-1.5 py-0.5 rounded text-xs" [style.background]="tooltip.color">{{ tooltip.category }}</span>
          </div>
          <div class="text-gray-400 mt-1">{{ tooltip.time }}</div>
          <div class="text-gray-300 font-mono">{{ tooltip.duration }}</div>
        </div>
      </div>

      <!-- Legend -->
      <div *ngIf="legend.length > 0" class="bg-gray-800 rounded-xl p-4 flex flex-wrap gap-4 text-sm">
        <div *ngFor="let item of legend" class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full flex-shrink-0" [style.background]="item.color"></span>
          <span class="text-gray-300">{{ item.name }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    canvas { image-rendering: auto; }
  `]
})
export class TimelineComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  fromInput = '';
  toInput = '';
  loading = false;
  errorMsg = '';
  totalActivities = 0;
  totalHours = 0;

  legend: { name: string; color: string }[] = [];
  categoryColors: Record<string, string> = {};

  presets = [
    { label: '30m', minutes: 30 },
    { label: '1h',  minutes: 60 },
    { label: '3h',  minutes: 180 },
    { label: '6h',  minutes: 360 },
    { label: '12h', minutes: 720 },
    { label: '24h', minutes: 1440 },
  ];
  currentPreset = 360;

  tooltip = { visible: false, x: 0, y: 0, process: '', title: '', category: '', time: '', duration: '', color: '', below: false };

  // click marker
  markerMs: number | null = null;
  markerDetail: { process: string; title: string; category: string; time: string; duration: string; color: string } | null = null;

  private activities: TimelineActivity[] = [];
  private processes: string[] = [];
  private viewStartMs = 0;
  private viewEndMs = 0;
  private dataMinMs = 0;
  private dataMaxMs = 0;

  dragging = false;
  private dragStartX = 0;
  private dragStartViewStart = 0;
  private dragStartViewEnd = 0;
  private _mouseDownX = 0;
  private _mouseDownY = 0;
  private _mouseLastX = 0;
  private _mouseLastY = 0;
  private resizeObs: ResizeObserver | null = null;

  private destroy = new Subject<void>();

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadCategories();
    const now = new Date();
    const start = new Date(now);
    start.setHours(now.getHours() - 6, 0, 0, 0);
    this.setDefaultRange(now, start);
    this.onRangeChange();
  }

  ngOnDestroy() {
    this.destroy.next();
    this.resizeObs?.disconnect();
  }

  ngAfterViewInit() {
    this.resizeObs = new ResizeObserver(() => this.render());
    this.resizeObs.observe(this.containerRef.nativeElement);
  }

  loadCategories() {
    this.api.getCategories().pipe(takeUntil(this.destroy)).subscribe(cats => {
      this.categoryColors = {};
      this.legend = [];
      for (const c of cats) {
        this.categoryColors[c.name] = c.color;
      }
    });
  }

  private setDefaultRange(now: Date, start: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    this.fromInput = fmt(start);
    this.toInput = fmt(now);
  }

  applyPreset(minutes: number) {
    this.currentPreset = minutes;
    if (!this.toInput) return;
    const toMs = new Date(this.toInput).getTime();
    this.viewEndMs = toMs;
    this.viewStartMs = toMs - minutes * 60_000;
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
        this.computeLegend();
        this.computeProcesses();
        this.computeDataRange();
        if (!this.currentPreset || this.viewEndMs === 0) {
          this.viewStartMs = this.dataMinMs;
          this.viewEndMs = this.dataMaxMs;
        }
        this.loading = false;
        this.render();
      },
      error: (err) => {
        this.errorMsg = err?.error?.detail || 'Failed to load timeline data';
        this.loading = false;
      },
    });
  }

  private computeLegend() {
    const seen = new Set<string>();
    this.legend = [];
    for (const a of this.activities) {
      const name = a.category || 'Uncategorized';
      if (!seen.has(name)) {
        seen.add(name);
        this.legend.push({ name, color: this.getColor(name) });
      }
    }
  }

  private computeProcesses() {
    const seen = new Set<string>();
    this.processes = [];
    for (const a of this.activities) {
      const p = a.process || 'unknown';
      if (!seen.has(p)) {
        seen.add(p);
        this.processes.push(p);
      }
    }
  }

  private computeDataRange() {
    if (this.activities.length === 0) {
      this.dataMinMs = this.viewStartMs || Date.now() - 3600000;
      this.dataMaxMs = this.dataMinMs + 3600000;
      return;
    }
    this.dataMinMs = Infinity;
    this.dataMaxMs = -Infinity;
    for (const a of this.activities) {
      const s = new Date(a.start_ts).getTime();
      this.dataMinMs = Math.min(this.dataMinMs, s);
      if (a.end_ts) {
        this.dataMaxMs = Math.max(this.dataMaxMs, new Date(a.end_ts).getTime());
      } else {
        this.dataMaxMs = Math.max(this.dataMaxMs, s + (a.duration_sec || 0) * 1000);
      }
    }
    if (!isFinite(this.dataMinMs)) {
      this.dataMinMs = Date.now() - 3600000;
      this.dataMaxMs = Date.now();
    }
  }

  getColor(cat: string): string {
    return this.categoryColors[cat] || '#555555';
  }

  // ── Rendering ──────────────────────────────────────────

  render() {
    const canvas = this.canvasRef.nativeElement;
    const container = this.containerRef.nativeElement;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const totalH = HEADER_H + INTEGRATED_H + this.processes.length * (LANE_H + LANE_GAP) + PAD;

    canvas.width = w * (window.devicePixelRatio || 1);
    canvas.height = totalH * (window.devicePixelRatio || 1);
    canvas.style.width = w + 'px';
    canvas.style.height = totalH + 'px';

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform((window.devicePixelRatio || 1), 0, 0, (window.devicePixelRatio || 1), 0, 0);

    ctx.clearRect(0, 0, w, totalH);

    // Background
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, w, totalH);

    if (this.activities.length === 0 || this.viewEndMs <= this.viewStartMs) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data in this range', w / 2, totalH / 2);
      return;
    }

    const timelineX = LEFT_W;
    const timelineW = w - LEFT_W - PAD;
    const viewMs = this.viewEndMs - this.viewStartMs;

    // Time ruler
    this.drawTimeRuler(ctx, timelineX, timelineW, PAD, viewMs);

    // Integrated bar
    this.drawIntegratedBar(ctx, timelineX, timelineW, viewMs);

    const procStartY = HEADER_H + INTEGRATED_H;

    // Process lanes
    for (let i = 0; i < this.processes.length; i++) {
      const y = procStartY + i * (LANE_H + LANE_GAP);

      // Lane background (alternating)
      ctx.fillStyle = i % 2 === 0 ? '#1e293b' : '#1a2332';
      ctx.fillRect(0, y, w, LANE_H);

      // Process label
      ctx.fillStyle = '#d1d5db';
      ctx.font = '11px "Fira Code", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const label = this.processes[i];
      ctx.fillText(label.length > 16 ? label.slice(0, 15) + '\u2026' : label, LEFT_W - 8, y + LANE_H / 2);

      // Label separator line
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(LEFT_W, y);
      ctx.lineTo(LEFT_W, y + LANE_H);
      ctx.stroke();
    }

    // Activity bars
    for (const a of this.activities) {
      const pIdx = this.processes.indexOf(a.process || 'unknown');
      if (pIdx < 0) continue;

      const startMs = new Date(a.start_ts).getTime();
      const endMs = a.end_ts ? new Date(a.end_ts).getTime() : startMs + (a.duration_sec || 0) * 1000;

      const x1 = timelineX + ((startMs - this.viewStartMs) / viewMs) * timelineW;
      const x2 = timelineX + ((endMs - this.viewStartMs) / viewMs) * timelineW;

      // Clip to timeline area
      const cx1 = Math.max(timelineX, x1);
      const cx2 = Math.min(timelineX + timelineW, x2);
      if (cx2 <= cx1) continue;

      const y = procStartY + pIdx * (LANE_H + LANE_GAP) + 2;
      const barH = LANE_H - 4;

      // Bar
      const color = this.getColor(a.category || 'Uncategorized');
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(cx1, y, cx2 - cx1, barH);
      ctx.globalAlpha = 1;

      // Bar border
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(cx1, y, cx2 - cx1, barH);
    }

    // Current time indicator
    const nowMs = Date.now();
    if (nowMs >= this.viewStartMs && nowMs <= this.viewEndMs) {
      const nowX = timelineX + ((nowMs - this.viewStartMs) / viewMs) * timelineW;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(nowX, PAD);
      ctx.lineTo(nowX, totalH - PAD);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(nowX, PAD + 4, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Marker line
    if (this.markerMs != null && this.markerMs >= this.viewStartMs && this.markerMs <= this.viewEndMs) {
      const mx = timelineX + ((this.markerMs - this.viewStartMs) / viewMs) * timelineW;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(mx, PAD);
      ctx.lineTo(mx, totalH - PAD);
      ctx.stroke();
      ctx.setLineDash([]);

      // Triangle indicator at top
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(mx, PAD - 2);
      ctx.lineTo(mx - 6, PAD - 12);
      ctx.lineTo(mx + 6, PAD - 12);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawTimeRuler(ctx: CanvasRenderingContext2D, x: number, w: number, topY: number, viewMs: number) {
    // Background
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, x + w + PAD, HEADER_H - PAD);

    // Calculate nice tick interval
    const idealTickPx = 80;
    const idealMs = (idealTickPx / w) * viewMs;

    const intervals = [
      1000, 5000, 10000, 30000, 60000,       // 1s .. 1m
      300000, 600000, 900000, 1800000,        // 5m .. 30m
      3600000, 7200000, 14400000,             // 1h .. 4h
      43200000, 86400000, 172800000,          // 12h .. 48h
    ];

    let tickMs = intervals[0];
    for (const iv of intervals) {
      tickMs = iv;
      if ((tickMs / viewMs) * w >= idealTickPx) break;
    }

    const firstTick = Math.ceil(this.viewStartMs / tickMs) * tickMs;

    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let t = firstTick; t <= this.viewEndMs; t += tickMs) {
      const tx = x + ((t - this.viewStartMs) / viewMs) * w;

      // Tick mark
      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(tx, HEADER_H - 28);
      ctx.lineTo(tx, HEADER_H - 8);
      ctx.stroke();

      // Label
      const d = new Date(t);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      let label: string;
      if (tickMs < 60000) {
        label = `${hh}:${mm}:${String(d.getSeconds()).padStart(2, '0')}`;
      } else if (tickMs < 86400000) {
        label = `${hh}:${mm}`;
      } else {
        label = `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
      }
      ctx.fillText(label, tx, HEADER_H - 28 - 14);
    }
  }

  private drawIntegratedBar(ctx: CanvasRenderingContext2D, x: number, w: number, viewMs: number) {
    const y = HEADER_H;
    const barH = INTEGRATED_H;

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, y, w, barH);

    // Label
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('Integrated', LEFT_W - 8, y + barH / 2);

    // Separator line
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(LEFT_W, y);
    ctx.lineTo(LEFT_W, y + barH);
    ctx.stroke();

    // Bottom border
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + barH);
    ctx.lineTo(x + w, y + barH);
    ctx.stroke();

    // Draw each activity as a colored segment, last-drawn wins (most recent)
    for (const a of this.activities) {
      const startMs = new Date(a.start_ts).getTime();
      const endMs = a.end_ts ? new Date(a.end_ts).getTime() : startMs + (a.duration_sec || 0) * 1000;

      const x1 = x + ((startMs - this.viewStartMs) / viewMs) * w;
      const x2 = x + ((endMs - this.viewStartMs) / viewMs) * w;

      const cx1 = Math.max(x, x1);
      const cx2 = Math.min(x + w, x2);
      if (cx2 <= cx1) continue;

      const color = this.getColor(a.category || 'Uncategorized');
      const barY = y + 4;
      const bh = barH - 8;

      // Draw with slight opacity so overlapping segments are visible
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.65;
      ctx.fillRect(cx1, barY, cx2 - cx1, bh);
    }
    ctx.globalAlpha = 1;

    // Thin border on top/bottom of each visible segment (for crispness)
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.3;
    for (const a of this.activities) {
      const startMs = new Date(a.start_ts).getTime();
      const endMs = a.end_ts ? new Date(a.end_ts).getTime() : startMs + (a.duration_sec || 0) * 1000;
      const x1 = x + ((startMs - this.viewStartMs) / viewMs) * w;
      const x2 = x + ((endMs - this.viewStartMs) / viewMs) * w;
      const cx1 = Math.max(x, x1);
      const cx2 = Math.min(x + w, x2);
      if (cx2 <= cx1) continue;
      ctx.strokeRect(cx1, y + 4, cx2 - cx1, barH - 8);
    }

    // Process name labels on wide segments (> 50px)
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.85;
    for (const a of this.activities) {
      const startMs = new Date(a.start_ts).getTime();
      const endMs = a.end_ts ? new Date(a.end_ts).getTime() : startMs + (a.duration_sec || 0) * 1000;
      const x1 = x + ((startMs - this.viewStartMs) / viewMs) * w;
      const x2 = x + ((endMs - this.viewStartMs) / viewMs) * w;
      const cx1 = Math.max(x, x1);
      const cx2 = Math.min(x + w, x2);
      if (cx2 - cx1 < 50) continue;
      const label = (a.process || '?').slice(0, Math.floor((cx2 - cx1) / 7));
      if (label) {
        ctx.fillText(label, cx1 + 4, y + barH / 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  private showIntegratedTooltip(e: MouseEvent, rect: DOMRect) {
    const mx = e.clientX - rect.left;
    const hoverMs = this.msFromX(e.clientX);
    const timelineW = rect.width - LEFT_W - PAD;
    const viewMs = this.viewEndMs - this.viewStartMs;

    // Find the most recently started activity that covers this time point
    let best: TimelineActivity | null = null;
    let bestStartMs = 0;

    for (const a of this.activities) {
      const as = new Date(a.start_ts).getTime();
      const ae = a.end_ts ? new Date(a.end_ts).getTime() : as + (a.duration_sec || 0) * 1000;
      if (hoverMs >= as && hoverMs <= ae && as >= bestStartMs) {
        best = a;
        bestStartMs = as;
      }
    }

    if (best) {
      const dur = best.duration_sec || 0;
      const durStr = dur < 60 ? `${dur}s` :
        dur < 3600 ? `${Math.floor(dur / 60)}m ${dur % 60}s` :
        `${Math.floor(dur / 3600)}h ${Math.floor((dur % 3600) / 60)}m`;

      const d = new Date(hoverMs);
      const timeStr = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

      this.tooltip = {
        visible: true,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        process: best.process || 'unknown',
        title: (best.title || '—').slice(0, 80),
        category: best.category || 'Uncategorized',
        time: timeStr,
        duration: durStr,
        color: this.getColor(best.category || 'Uncategorized'),
        below: true,
      };
    } else {
      this.tooltip.visible = false;
    }
  }

  // ── Mouse interaction ──────────────────────────────────

  private msFromX(clientX: number): number {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = clientX - rect.left - LEFT_W;
    const timelineW = rect.width - LEFT_W - PAD;
    const ratio = Math.max(0, Math.min(1, x / timelineW));
    return this.viewStartMs + ratio * (this.viewEndMs - this.viewStartMs);
  }

  onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    this.dragging = true;
    this.dragStartX = e.clientX;
    this.dragStartViewStart = this.viewStartMs;
    this.dragStartViewEnd = this.viewEndMs;
    this.tooltip.visible = false;
    this._mouseDownX = e.clientX;
    this._mouseDownY = e.clientY;
    this._mouseLastX = e.clientX;
    this._mouseLastY = e.clientY;
  }

  onMouseMove(e: MouseEvent) {
    this._mouseLastX = e.clientX;
    this._mouseLastY = e.clientY;

    if (this.dragging) {
      const dx = e.clientX - this.dragStartX;
      const rect = this.canvasRef.nativeElement.getBoundingClientRect();
      const timelineW = rect.width - LEFT_W - PAD;
      const msPerPx = (this.dragStartViewEnd - this.dragStartViewStart) / timelineW;
      const shiftMs = -dx * msPerPx;
      this.viewStartMs = this.dragStartViewStart + shiftMs;
      this.viewEndMs = this.dragStartViewEnd + shiftMs;
      this.render();
      return;
    }

    // Hover tooltip
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const timelineX = LEFT_W;
    const timelineW = rect.width - LEFT_W - PAD;
    const procStartY = HEADER_H + INTEGRATED_H;

    if (mx < timelineX || mx > timelineX + timelineW) {
      this.tooltip.visible = false;
      return;
    }

    const hoverMs = this.msFromX(e.clientX);

    // Integrated bar
    if (my >= HEADER_H && my < procStartY) {
      this.showIntegratedTooltip(e, rect);
      return;
    }

    // Find the activity under the mouse in process lanes
    let found: TimelineActivity | null = null;
    const viewMs = this.viewEndMs - this.viewStartMs;

    for (const a of this.activities) {
      const pIdx = this.processes.indexOf(a.process || 'unknown');
      if (pIdx < 0) continue;
      const ay = procStartY + pIdx * (LANE_H + LANE_GAP);
      if (my < ay || my > ay + LANE_H) continue;

      const as = new Date(a.start_ts).getTime();
      const ae = a.end_ts ? new Date(a.end_ts).getTime() : as + (a.duration_sec || 0) * 1000;
      const ax1 = timelineX + ((as - this.viewStartMs) / viewMs) * timelineW;
      const ax2 = timelineX + ((ae - this.viewStartMs) / viewMs) * timelineW;
      if (mx >= ax1 && mx <= ax2) {
        found = a;
        break;
      }
    }

    if (found) {
      const dur = found.duration_sec || 0;
      const durStr = dur < 60 ? `${dur}s` :
        dur < 3600 ? `${Math.floor(dur / 60)}m ${dur % 60}s` :
        `${Math.floor(dur / 3600)}h ${Math.floor((dur % 3600) / 60)}m`;

      const d = new Date(found.start_ts);
      const timeStr = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      this.tooltip = {
        visible: true,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 8,
        process: found.process || 'unknown',
        title: (found.title || '—').slice(0, 80),
        category: found.category || 'Uncategorized',
        time: timeStr,
        duration: durStr,
        color: this.getColor(found.category || 'Uncategorized'),
        below: false,
      };
    } else {
      this.tooltip.visible = false;
    }
  }

  onMouseUp() {
    if (this.dragging &&
        Math.abs(this._mouseDownX - this._mouseLastX) < 4 &&
        Math.abs(this._mouseDownY - this._mouseLastY) < 4) {
      this.placeMarker(this._mouseLastX);
    }
    this.dragging = false;
  }

  private placeMarker(clientX: number) {
    const ms = this.msFromX(clientX);
    this.markerMs = ms;
    this._computeMarkerDetail(ms);
    this.render();
  }

  private _computeMarkerDetail(ms: number) {
    let best: TimelineActivity | null = null;
    let bestStartMs = 0;

    for (const a of this.activities) {
      const as = new Date(a.start_ts).getTime();
      const ae = a.end_ts ? new Date(a.end_ts).getTime() : as + (a.duration_sec || 0) * 1000;
      if (ms >= as && ms <= ae && as >= bestStartMs) {
        best = a;
        bestStartMs = as;
      }
    }

    if (best) {
      const dur = best.duration_sec || 0;
      const durStr = dur < 60 ? `${dur}s` :
        dur < 3600 ? `${Math.floor(dur / 60)}m ${dur % 60}s` :
        `${Math.floor(dur / 3600)}h ${Math.floor((dur % 3600) / 60)}m`;

      const d = new Date(ms);
      const timeStr = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

      this.markerDetail = {
        process: best.process || 'unknown',
        title: best.title || '—',
        category: best.category || 'Uncategorized',
        time: timeStr,
        duration: durStr,
        color: this.getColor(best.category || 'Uncategorized'),
      };
    } else {
      const d = new Date(ms);
      const timeStr = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      this.markerDetail = {
        process: '—',
        title: 'No activity at this moment',
        category: 'Idle',
        time: timeStr,
        duration: '—',
        color: '#555',
      };
    }
  }

  onWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.3 : 1 / 1.3;
    const viewMs = this.viewEndMs - this.viewStartMs;
    let newViewMs = viewMs * zoomFactor;

    newViewMs = Math.max(MIN_VIEW_MS, Math.min(MAX_VIEW_MS, newViewMs));

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const timelineW = rect.width - LEFT_W - PAD;
    const ratio = Math.max(0, Math.min(1, (mouseX - LEFT_W) / timelineW));

    const centerMs = this.viewStartMs + ratio * viewMs;
    this.viewStartMs = centerMs - newViewMs * ratio;
    this.viewEndMs = this.viewStartMs + newViewMs;

    this.tooltip.visible = false;
    this.render();
  }
}
