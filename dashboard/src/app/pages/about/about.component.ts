import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-6 max-w-2xl">
      <h1 class="text-2xl font-bold">About</h1>

      <div class="bg-gray-800 rounded-xl p-6 space-y-5">
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center text-2xl">
            ⏱️
          </div>
          <div>
            <h2 class="text-xl font-bold text-white">Time Tracker</h2>
            <p class="text-sm text-gray-400">v0.1.0</p>
          </div>
        </div>
        <p class="text-sm text-gray-300 leading-relaxed">
          Cross-platform desktop time tracker with regex categorization,
          periodic screenshots, and dual Gregorian/Jalali calendar support.
        </p>
      </div>

      <div class="bg-gray-800 rounded-xl p-6 space-y-3">
        <h2 class="text-lg font-semibold">Credits</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div class="text-gray-500 text-xs">Developer</div>
            <div class="text-white">Max. Blackwell</div>
          </div>
          <div>
            <div class="text-gray-500 text-xs">AI-assisted by</div>
            <div class="text-white text-xs leading-relaxed">
              Gemini 3.5 Flash &middot; GLM 5.2<br/>
              DeepSeek V4 Pro &middot; Mimo 2.5
            </div>
          </div>
        </div>
      </div>

      <div class="bg-gray-800 rounded-xl p-6 space-y-3">
        <h2 class="text-lg font-semibold">Links</h2>
        <div class="space-y-2 text-sm">
          <div>
            <div class="text-gray-500 text-xs mb-0.5">Source</div>
            <a href="https://github.com/majidasgari/time-tracker" target="_blank"
              class="text-indigo-400 hover:text-indigo-300 font-mono text-xs break-all">
              github.com/majidasgari/time-tracker
            </a>
          </div>
        </div>
      </div>

      <div class="bg-gray-800 rounded-xl p-6 space-y-3">
        <h2 class="text-lg font-semibold">Tech Stack</h2>
        <div class="flex flex-wrap gap-2">
          <span class="px-2.5 py-1 rounded-md bg-blue-900/40 text-blue-300 text-xs font-mono">Python</span>
          <span class="px-2.5 py-1 rounded-md bg-blue-900/40 text-blue-300 text-xs font-mono">PySide6</span>
          <span class="px-2.5 py-1 rounded-md bg-blue-900/40 text-blue-300 text-xs font-mono">FastAPI</span>
          <span class="px-2.5 py-1 rounded-md bg-blue-900/40 text-blue-300 text-xs font-mono">SQLite</span>
          <span class="px-2.5 py-1 rounded-md bg-green-900/40 text-green-300 text-xs font-mono">Angular 19</span>
          <span class="px-2.5 py-1 rounded-md bg-green-900/40 text-green-300 text-xs font-mono">ECharts</span>
          <span class="px-2.5 py-1 rounded-md bg-green-900/40 text-green-300 text-xs font-mono">TailwindCSS</span>
          <span class="px-2.5 py-1 rounded-md bg-purple-900/40 text-purple-300 text-xs font-mono">asa-date-picker</span>
        </div>
      </div>

      <div class="bg-gray-800 rounded-xl p-6 space-y-3">
        <h2 class="text-lg font-semibold text-yellow-400">Donate</h2>
        <p class="text-sm text-gray-400">Support development with TRC-20 (TRON):</p>
        <code
          class="block bg-gray-900 rounded-lg px-4 py-3 text-sm font-mono text-yellow-300 break-all select-all cursor-pointer hover:bg-gray-850 transition-colors"
          (click)="copyDonation()">
          TLELddwY6sCCACAzu1Wn2kihSBX8PHW32n
        </code>
        <p *ngIf="donationCopied" class="text-xs text-green-400">Copied to clipboard!</p>
        <p *ngIf="!donationCopied" class="text-xs text-gray-500">Click to copy</p>
      </div>
    </div>
  `,
})
export class AboutComponent {
  donationCopied = false;

  copyDonation() {
    navigator.clipboard.writeText('TLELddwY6sCCACAzu1Wn2kihSBX8PHW32n').then(() => {
      this.donationCopied = true;
      setTimeout(() => (this.donationCopied = false), 2000);
    });
  }
}
