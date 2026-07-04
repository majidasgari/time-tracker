import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, BreakdownItem, Status } from '../../services/api.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-6">
      <h1 class="text-2xl font-bold">Overview</h1>

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

      <div class="bg-gray-800 rounded-xl p-5">
        <h2 class="text-lg font-semibold mb-4">Time by Category</h2>
        <div class="space-y-3">
          <div *ngFor="let item of breakdown" class="flex items-center gap-3">
            <span class="w-24 text-sm">{{ item.category }}</span>
            <div class="flex-1 bg-gray-700 rounded-full h-4">
              <div class="bg-blue-500 h-4 rounded-full" [style.width.%]="item.total_sec / maxSec * 100"></div>
            </div>
            <span class="text-sm w-16 text-right">{{ item.total_sec / 60 | number:'1.0-0' }}m</span>
          </div>
        </div>
      </div>

      <div class="bg-gray-800 rounded-xl p-5">
        <h2 class="text-lg font-semibold mb-4">Recent Activities</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-gray-400 border-b border-gray-700">
                <th class="text-right py-2">Time</th>
                <th class="text-right py-2">Process</th>
                <th class="text-right py-2">Category</th>
                <th class="text-right py-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let a of activities" class="border-b border-gray-700/50">
                <td class="py-2">{{ a.start_ts?.slice(11, 19) }}</td>
                <td class="py-2">{{ a.process || '—' }}</td>
                <td class="py-2">
                  <span class="px-2 py-0.5 rounded text-xs"
                    [class.bg-red-500]="a.category === 'کدنویسی'"
                    [class.bg-blue-500]="a.category === 'مرورگر'"
                    [class.bg-orange-500]="a.category === 'ترمینال'"
                    [class.bg-gray-500]="a.category === 'Idle'"
                    [class.bg-gray-600]="a.category && !['کدنویسی','مرورگر','ترمینال','Idle'].includes(a.category)">
                    {{ a.category }}
                  </span>
                </td>
                <td class="py-2">{{ a.duration_sec ? (a.duration_sec / 60 | number:'1.0-0') + 'm' : '⚡' }}</td>
              </tr>
            </tbody>
          </table>
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
  private destroy = new Subject<void>();

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.load();
    setInterval(() => this.load(), 5000);
  }

  ngOnDestroy() {
    this.destroy.next();
  }

  load() {
    this.api.getActivities(50).subscribe(a => this.activities = a);
    this.api.getBreakdown().subscribe(b => {
      this.breakdown = b;
      this.maxSec = Math.max(1, ...b.map(x => x.total_sec));
    });
    this.api.getStatus().subscribe(s => this.status = s);
  }
}
