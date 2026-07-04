import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-6">
      <h1 class="text-2xl font-bold">Categories</h1>
      <div class="bg-gray-800 rounded-xl p-5">
        <p class="text-gray-400">Category management will be implemented here.</p>
      </div>
    </div>
  `
})
export class CategoriesComponent {}
