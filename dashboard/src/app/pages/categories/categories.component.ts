import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ApiService, CategoryOut, CategoryIn, RuleOut, RuleIn,
} from '../../services/api.service';
import { DateTimeInputComponent } from '../../shared/date-input.component';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule, FormsModule, DateTimeInputComponent],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">Categories</h1>
        <button (click)="openAddCategory()"
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors">
          + Add Category
        </button>
      </div>

      <!-- error message -->
      <div *ngIf="errorMsg" class="bg-red-900/50 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300">
        {{ errorMsg }}
        <button (click)="errorMsg = ''" class="ml-3 underline">Dismiss</button>
      </div>

      <!-- success message -->
      <div *ngIf="successMsg" class="bg-green-900/50 border border-green-700 rounded-lg px-4 py-3 text-sm text-green-300">
        {{ successMsg }}
        <button (click)="successMsg = ''" class="ml-3 underline">Dismiss</button>
      </div>

      <!-- loading state -->
      <div *ngIf="loading && categories.length === 0" class="flex justify-center py-16">
        <div class="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <!-- category form modal -->
      <div *ngIf="showCatForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" (click)="maybeCloseCatForm($event)">
        <div class="bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl border border-gray-700" (click)="$event.stopPropagation()">
          <h2 class="text-lg font-semibold mb-4">{{ editingCat ? 'Edit Category' : 'New Category' }}</h2>
          <div class="space-y-3">
            <div>
              <label class="block text-sm text-gray-400 mb-1">Name</label>
              <input type="text" [(ngModel)]="catForm.name"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Color</label>
              <div class="flex items-center gap-2">
                <input type="color" [(ngModel)]="catForm.color"
                  class="w-10 h-10 rounded cursor-pointer bg-transparent border-0 p-0" />
                <input type="text" [(ngModel)]="catForm.color"
                  class="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Priority <span class="text-gray-600">(lower = checked first)</span></label>
              <input type="number" [(ngModel)]="catForm.priority"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div class="flex items-center gap-2">
              <input type="checkbox" id="cat-enabled" [(ngModel)]="catForm.enabled"
                class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-indigo-600 focus:ring-indigo-500" />
              <label for="cat-enabled" class="text-sm text-gray-300">Enabled</label>
            </div>
          </div>
          <div class="flex items-center justify-end gap-3 mt-5">
            <button (click)="showCatForm = false"
              class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-colors">Cancel</button>
            <button (click)="saveCategory()"
              class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors">
              {{ editingCat ? 'Update' : 'Create' }}
            </button>
          </div>
        </div>
      </div>

      <!-- rule form modal -->
      <div *ngIf="showRuleForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" (click)="maybeCloseRuleForm($event)">
        <div class="bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl border border-gray-700" (click)="$event.stopPropagation()">
          <h2 class="text-lg font-semibold mb-4">{{ editingRule ? 'Edit Rule' : 'Add Rule' }}</h2>
          <div class="space-y-3">
            <div>
              <label class="block text-sm text-gray-400 mb-1">Process Regex</label>
              <input type="text" [(ngModel)]="ruleForm.process_regex" placeholder="e.g. code|jetbrains"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Title Regex</label>
              <input type="text" [(ngModel)]="ruleForm.title_regex" placeholder="e.g. \\\\.py"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500" />
            </div>

            <!-- recompute toggle -->
            <div class="border-t border-gray-700 pt-3 mt-1">
              <div class="flex items-center gap-2">
                <input type="checkbox" id="rule-recompute" [(ngModel)]="ruleRecompute"
                  class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-indigo-600 focus:ring-indigo-500" />
                <label for="rule-recompute" class="text-sm text-gray-300">Apply to saved activities</label>
              </div>
              <p class="text-xs text-gray-500 mt-1 ml-6">
                Re-categorize past activities using the new/updated rule. If disabled, the rule only affects future tracking.
              </p>

              <div *ngIf="ruleRecompute" class="mt-3 ml-6">
                <label class="block text-xs text-gray-400 mb-1">From date</label>
                <app-datetime-input [(ngModel)]="ruleRecomputeFrom"
                  placeholder="From date..."
                />
                <p class="text-xs text-gray-500 mt-1">
                  Only activities recorded on or after this date will be re-categorized. Leave empty to process all history.
                </p>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-end gap-3 mt-5">
            <button (click)="showRuleForm = false"
              class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-colors">Cancel</button>
            <button (click)="saveRule()"
              class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors">
              {{ editingRule ? 'Update' : 'Add' }}
            </button>
          </div>
        </div>
      </div>

      <!-- delete confirm modal -->
      <div *ngIf="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" (click)="showDeleteConfirm = false">
        <div class="bg-gray-800 rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl border border-gray-700" (click)="$event.stopPropagation()">
          <h2 class="text-lg font-semibold mb-3">Confirm Delete</h2>
          <p class="text-sm text-gray-400 mb-5">{{ deleteMessage }}</p>
          <div class="flex items-center justify-end gap-3">
            <button (click)="showDeleteConfirm = false"
              class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-colors">Cancel</button>
            <button (click)="confirmDelete()"
              class="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-medium transition-colors">Delete</button>
          </div>
        </div>
      </div>

      <!-- categories list -->
      <div *ngIf="categories.length === 0 && !loading" class="bg-gray-800 rounded-xl p-8 text-center text-gray-500">
        No categories defined yet. Click "+ Add Category" to get started.
      </div>

      <div *ngFor="let cat of categories; trackBy: trackById" class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <!-- category header -->
        <div class="flex items-center gap-4 p-5 cursor-pointer hover:bg-gray-750 transition-colors"
          (click)="toggleExpand(cat)">
          <span class="w-4 h-4 rounded-full flex-shrink-0" [style.background]="cat.color"></span>
          <span class="flex-1 font-medium">{{ cat.name }}</span>
          <span *ngIf="!cat.enabled" class="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">Disabled</span>
          <span class="text-xs text-gray-500 mr-1">priority: {{ cat.priority }}</span>
          <span class="text-xs text-gray-600 bg-gray-700/50 rounded px-2 py-0.5">{{ cat.rules.length }} rule{{ cat.rules.length !== 1 ? 's' : '' }}</span>
          <svg class="w-4 h-4 text-gray-500 transition-transform" [class.rotate-90]="expanded.has(cat.id)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </div>

        <!-- expanded rules section -->
        <div *ngIf="expanded.has(cat.id)" class="border-t border-gray-700 px-5 py-4 space-y-3 bg-gray-800/50">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wide">Rules</h3>
            <div class="flex items-center gap-2">
              <button (click)="openEditCategory(cat)"
                class="text-xs px-3 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">Edit</button>
              <button (click)="confirmDeleteCategory(cat)"
                class="text-xs px-3 py-1 rounded-lg bg-gray-700 hover:bg-red-600 text-gray-300 transition-colors">Delete</button>
            </div>
          </div>

          <div *ngIf="cat.rules.length === 0" class="text-sm text-gray-500 py-3">
            No rules yet. A category needs at least one rule to match activities.
          </div>

          <div *ngFor="let rule of cat.rules" class="flex items-start gap-3 bg-gray-700/50 rounded-lg px-4 py-3">
            <div class="flex-1 min-w-0 space-y-1 text-sm">
              <div *ngIf="rule.process_regex" class="flex items-center gap-2">
                <span class="text-gray-500 text-xs w-14 flex-shrink-0">Process:</span>
                <code class="text-gray-300 font-mono text-xs break-all">{{ rule.process_regex }}</code>
              </div>
              <div *ngIf="rule.title_regex" class="flex items-center gap-2">
                <span class="text-gray-500 text-xs w-14 flex-shrink-0">Title:</span>
                <code class="text-gray-300 font-mono text-xs break-all">{{ rule.title_regex }}</code>
              </div>
              <div *ngIf="!rule.process_regex && !rule.title_regex" class="text-gray-500 text-xs italic">
                Both regexes are empty — will match anything
              </div>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
              <button (click)="openEditRule(cat, rule)"
                class="text-xs px-2 py-1 rounded bg-gray-600 hover:bg-gray-500 text-gray-300 transition-colors">Edit</button>
              <button (click)="confirmDeleteRule(rule)"
                class="text-xs px-2 py-1 rounded bg-gray-600 hover:bg-red-500 text-gray-300 transition-colors">Delete</button>
            </div>
          </div>

          <div class="pt-1">
            <button (click)="openAddRule(cat)"
              class="text-xs px-3 py-1.5 rounded-lg bg-indigo-600/70 hover:bg-indigo-600 text-gray-200 transition-colors">
              + Add Rule
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class CategoriesComponent implements OnInit, OnDestroy {
  categories: CategoryOut[] = [];
  expanded = new Set<number>();
  loading = false;
  errorMsg = '';
  successMsg = '';

  // category form
  showCatForm = false;
  editingCat: CategoryOut | null = null;
  catForm: CategoryIn = { name: '', color: '#cccccc', priority: 0, enabled: true };

  // rule form
  showRuleForm = false;
  editingRule: RuleOut | null = null;
  currentCat: CategoryOut | null = null;
  ruleForm: RuleIn = { process_regex: '', title_regex: '', recompute_from: null };
  ruleRecompute = false;
  ruleRecomputeFrom = '';

  // delete confirm
  showDeleteConfirm = false;
  deleteMessage = '';
  private deleteTarget: 'category' | 'rule' = 'category';
  private deleteId: number | null = null;

  private destroy = new Subject<void>();

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadCategories();
  }

  ngOnDestroy() {
    this.destroy.next();
  }

  loadCategories() {
    this.loading = true;
    this.api.getCategories().pipe(takeUntil(this.destroy)).subscribe({
      next: (data) => {
        this.categories = data;
        this.loading = false;
      },
      error: (err) => {
        this.errorMsg = err?.error?.detail || 'Failed to load categories';
        this.loading = false;
      },
    });
  }

  toggleExpand(cat: CategoryOut) {
    if (this.expanded.has(cat.id)) {
      this.expanded.delete(cat.id);
    } else {
      this.expanded.add(cat.id);
    }
  }

  trackById(_i: number, c: CategoryOut) { return c.id; }

  // ── Category CRUD ──

  openAddCategory() {
    this.editingCat = null;
    this.catForm = { name: '', color: '#cccccc', priority: 0, enabled: true };
    this.showCatForm = true;
  }

  openEditCategory(cat: CategoryOut) {
    this.editingCat = cat;
    this.catForm = { name: cat.name, color: cat.color, priority: cat.priority, enabled: cat.enabled };
    this.showCatForm = true;
  }

  maybeCloseCatForm(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('fixed')) {
      this.showCatForm = false;
    }
  }

  saveCategory() {
    if (!this.catForm.name.trim()) {
      this.errorMsg = 'Category name is required';
      return;
    }
    if (this.editingCat) {
      this.api.updateCategory(this.editingCat.id, this.catForm).pipe(takeUntil(this.destroy)).subscribe({
        next: () => { this.showCatForm = false; this.loadCategories(); this.successMsg = 'Category updated'; },
        error: (err) => { this.errorMsg = err?.error?.detail || 'Failed to update category'; },
      });
    } else {
      this.api.createCategory(this.catForm).pipe(takeUntil(this.destroy)).subscribe({
        next: () => { this.showCatForm = false; this.loadCategories(); this.successMsg = 'Category created'; },
        error: (err) => { this.errorMsg = err?.error?.detail || 'Failed to create category'; },
      });
    }
  }

  confirmDeleteCategory(cat: CategoryOut) {
    this.deleteTarget = 'category';
    this.deleteId = cat.id;
    this.deleteMessage = `Delete category "${cat.name}" and all its ${cat.rules.length} rule(s)?`;
    this.showDeleteConfirm = true;
  }

  // ── Rule CRUD ──

  openAddRule(cat: CategoryOut) {
    this.currentCat = cat;
    this.editingRule = null;
    this.ruleForm = { process_regex: '', title_regex: '', recompute_from: null };
    this.ruleRecompute = false;
    this.ruleRecomputeFrom = '';
    this.showRuleForm = true;
  }

  openEditRule(cat: CategoryOut, rule: RuleOut) {
    this.currentCat = cat;
    this.editingRule = rule;
    this.ruleForm = { process_regex: rule.process_regex, title_regex: rule.title_regex, recompute_from: null };
    this.ruleRecompute = false;
    this.ruleRecomputeFrom = '';
    this.showRuleForm = true;
  }

  maybeCloseRuleForm(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('fixed')) {
      this.showRuleForm = false;
    }
  }

  saveRule() {
    if (!this.ruleForm.process_regex && !this.ruleForm.title_regex) {
      this.errorMsg = 'At least one regex (process or title) is required';
      return;
    }
    const body: RuleIn = { ...this.ruleForm };
    if (this.ruleRecompute && this.ruleRecomputeFrom) {
      body.recompute_from = new Date(this.ruleRecomputeFrom).toISOString();
    } else if (this.ruleRecompute) {
      body.recompute_from = new Date(0).toISOString();
    }

    if (this.editingRule) {
      this.api.updateRule(this.editingRule.id, body).pipe(takeUntil(this.destroy)).subscribe({
        next: () => { this.showRuleForm = false; this.loadCategories(); this.successMsg = this.ruleRecompute ? 'Rule updated & activities re-categorized' : 'Rule updated'; },
        error: (err) => { this.errorMsg = err?.error?.detail || 'Failed to update rule'; },
      });
    } else if (this.currentCat) {
      this.api.createRule(this.currentCat.id, body).pipe(takeUntil(this.destroy)).subscribe({
        next: () => { this.showRuleForm = false; this.loadCategories(); this.successMsg = this.ruleRecompute ? 'Rule added & activities re-categorized' : 'Rule added'; },
        error: (err) => { this.errorMsg = err?.error?.detail || 'Failed to add rule'; },
      });
    }
  }

  confirmDeleteRule(rule: RuleOut) {
    this.deleteTarget = 'rule';
    this.deleteId = rule.id;
    this.deleteMessage = 'Delete this rule?';
    this.showDeleteConfirm = true;
  }

  confirmDelete() {
    if (this.deleteTarget === 'category' && this.deleteId != null) {
      this.api.deleteCategory(this.deleteId).pipe(takeUntil(this.destroy)).subscribe({
        next: () => {
          this.showDeleteConfirm = false;
          this.expanded.delete(this.deleteId!);
          this.loadCategories();
          this.successMsg = 'Category deleted';
        },
        error: (err) => { this.errorMsg = err?.error?.detail || 'Failed to delete'; },
      });
    } else if (this.deleteTarget === 'rule' && this.deleteId != null) {
      this.api.deleteRule(this.deleteId).pipe(takeUntil(this.destroy)).subscribe({
        next: () => { this.showDeleteConfirm = false; this.loadCategories(); this.successMsg = 'Rule deleted'; },
        error: (err) => { this.errorMsg = err?.error?.detail || 'Failed to delete'; },
      });
    }
  }
}
