import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, AppConfig } from '../../services/api.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <h1 class="text-2xl font-bold">Settings</h1>

      <!-- success / error -->
      <div *ngIf="errorMsg" class="bg-red-900/50 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300">
        {{ errorMsg }}
        <button (click)="errorMsg = ''" class="ml-3 underline">Dismiss</button>
      </div>
      <div *ngIf="successMsg" class="bg-green-900/50 border border-green-700 rounded-lg px-4 py-3 text-sm text-green-300">
        {{ successMsg }}
      </div>

      <!-- Loading -->
      <div *ngIf="loading" class="flex justify-center py-16">
        <div class="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <!-- Screenshot Settings -->
      <div class="bg-gray-800 rounded-xl p-5 space-y-5">
        <h2 class="text-lg font-semibold">Screenshots</h2>

        <!-- Storage directory -->
        <div>
          <label class="block text-sm text-gray-400 mb-1.5">Storage Directory</label>
          <div class="flex items-center gap-2">
            <input type="text" [(ngModel)]="screenshotDir"
              class="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500"
              placeholder="~/.timetracker/screenshots" />
            <button (click)="pickFolder()"
              class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm text-gray-300 transition-colors flex-shrink-0">
              Browse…
            </button>
          </div>
          <p class="text-xs text-gray-500 mt-1">Absolute path where screenshots will be saved. Use the Browse button or edit manually.</p>
        </div>

        <!-- Interval -->
        <div>
          <label class="block text-sm text-gray-400 mb-1.5">Capture Interval (seconds)</label>
          <div class="flex items-center gap-2">
            <input type="range" [(ngModel)]="screenshotInterval" min="1" max="300" step="1"
              class="flex-1 accent-indigo-500 h-2" />
            <span class="text-sm font-mono text-gray-300 w-16 text-right">{{ screenshotInterval }}s</span>
          </div>
          <div class="flex justify-between text-xs text-gray-500 mt-0.5">
            <span>1s (every second)</span>
            <span>300s (every 5 min)</span>
          </div>
        </div>

        <!-- Quality -->
        <div>
          <label class="block text-sm text-gray-400 mb-1.5">Quality</label>
          <div class="flex gap-2">
            <button *ngFor="let q of qualities" (click)="screenshotQuality = q.value"
              [class]="'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ' +
                (screenshotQuality === q.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600')">
              <div>{{ q.label }}</div>
              <div class="text-[10px] opacity-70 mt-0.5">{{ q.desc }}</div>
            </button>
          </div>
        </div>

        <!-- Retention -->
        <div>
          <label class="block text-sm text-gray-400 mb-1.5">Retention (days)</label>
          <div class="flex items-center gap-2">
            <input type="range" [(ngModel)]="retentionDays" min="1" max="90" step="1"
              class="flex-1 accent-indigo-500 h-2" />
            <span class="text-sm font-mono text-gray-300 w-12 text-right">{{ retentionDays }}d</span>
          </div>
        </div>
      </div>

      <!-- Read-only info -->
      <div class="bg-gray-800 rounded-xl p-5 space-y-3">
        <h2 class="text-lg font-semibold">System Info</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div class="text-gray-500 text-xs">Poll Interval</div>
            <div class="text-gray-300 font-mono">{{ pollInterval }}s</div>
          </div>
          <div>
            <div class="text-gray-500 text-xs">Database</div>
            <div class="text-gray-300 font-mono text-xs break-all">{{ dbPath }}</div>
          </div>
        </div>
      </div>

      <!-- Save -->
      <div class="flex items-center justify-end">
        <button (click)="save()" [disabled]="saving"
          class="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition-colors">
          {{ saving ? 'Saving…' : 'Save Settings' }}
        </button>
        <p class="text-xs text-gray-500 mr-4">Restart required for changes to take effect.</p>
      </div>
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  loading = true;
  saving = false;
  errorMsg = '';
  successMsg = '';

  screenshotDir = '';
  screenshotInterval = 10;
  screenshotQuality = 'low';
  retentionDays = 7;
  pollInterval = 1;
  dbPath = '';

  qualities = [
    { value: 'low',   label: 'Low',   desc: 'Small files' },
    { value: 'medium',label: 'Medium',desc: 'Balanced' },
    { value: 'high',  label: 'High',  desc: 'Best quality' },
  ];

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getConfig().subscribe({
      next: (c) => {
        this.screenshotDir      = c.screenshot_dir;
        this.screenshotInterval = c.screenshot_interval_sec;
        this.screenshotQuality  = c.screenshot_quality;
        this.retentionDays      = c.retention_days;
        this.pollInterval       = c.poll_interval_sec;
        this.dbPath             = c.db_path;
        this.loading = false;
      },
      error: (err) => {
        this.errorMsg = 'Failed to load settings';
        this.loading = false;
      },
    });
  }

  async pickFolder() {
    this.api.pickDirectory(this.screenshotDir || '').subscribe({
      next: (res) => {
        if (res.path) {
          this.screenshotDir = res.path;
        }
      },
      error: () => {},
    });
  }

  save() {
    this.saving = true;
    this.successMsg = '';
    this.errorMsg = '';
    this.api.updateConfig({
      screenshot_dir: this.screenshotDir,
      screenshot_interval_sec: this.screenshotInterval,
      screenshot_quality: this.screenshotQuality,
      retention_days: this.retentionDays,
    }).subscribe({
      next: () => {
        this.saving = false;
        this.successMsg = 'Settings saved. Restart to apply changes.';
      },
      error: (err) => {
        this.saving = false;
        this.errorMsg = err?.error?.detail || 'Failed to save settings';
      },
    });
  }
}
