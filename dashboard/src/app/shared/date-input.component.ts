import { Component, forwardRef, Input, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { AsaDatePickerModule } from 'asa-date-picker';
import { SettingsService, CalendarType } from '../services/settings.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-datetime-input',
  standalone: true,
  imports: [CommonModule, FormsModule, AsaDatePickerModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DateTimeInputComponent),
      multi: true,
    },
  ],
  template: `
    <div class="tt-dt-wrapper">
      <asa-date-picker
        [format]="dateFormat"
        [calendarType]="calendarType"
        valueFormat="date"
        [showTimePicker]="true"
        [showToday]="true"
        [cssClass]="'tt-datetime-picker'"
        [inputPlaceholder]="placeholder"
        (onChangeValue)="onDateChange($event)"
        (onFocus)="onTouched()"
      ></asa-date-picker>
      <div *ngIf="calendarType === 'jalali' && gregorianLabel" class="tt-gregorian-hint">
        {{ gregorianLabel }}
      </div>
    </div>
  `,
  styles: [`
    :host { display: inline-block; }
    .tt-dt-wrapper { position: relative; }
    .tt-gregorian-hint {
      font-size: 0.65rem;
      color: rgb(156, 163, 175);
      margin-top: 2px;
      line-height: 1.2;
      white-space: nowrap;
    }
    :host ::ng-deep .tt-datetime-picker .asa-date-picker-input {
      background-color: rgb(55, 65, 81);
      border: 1px solid rgb(75, 85, 99);
      border-radius: 0.5rem;
      padding: 0.375rem 0.75rem;
      font-size: 0.875rem;
      color: rgb(243, 244, 246);
      outline: none;
    }
    :host ::ng-deep .tt-datetime-picker .asa-date-picker-input:focus {
      border-color: rgb(99, 102, 241);
    }
    :host ::ng-deep .tt-datetime-picker .asa-date-picker-input::placeholder {
      color: rgb(156, 163, 175);
    }
  `],
})
export class DateTimeInputComponent implements ControlValueAccessor, OnDestroy {
  @Input() placeholder = 'Select date...';

  calendarType: CalendarType = 'gregorian';
  dateFormat = 'yyyy/MM/dd HH:mm';
  gregorianLabel = '';

  private destroy = new Subject<void>();
  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  constructor(private settings: SettingsService) {
    this.calendarType = this.settings.calendarType;
    this.settings.calendarType$
      .pipe(takeUntil(this.destroy))
      .subscribe(type => {
        this.calendarType = type;
        this.dateFormat = type === 'jalali' ? 'yyyy/MM/dd HH:mm' : 'yyyy/MM/dd HH:mm';
      });
  }

  ngOnDestroy() {
    this.destroy.next();
    this.destroy.complete();
  }

  writeValue(value: string): void {}
  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }

  onDateChange(date: Date | string): void {
    if (!date) {
      this.gregorianLabel = '';
      this.onChange('');
      return;
    }

    let d: Date;
    if (date instanceof Date) {
      d = date;
    } else if (typeof date === 'string') {
      d = new Date(date);
    } else {
      this.gregorianLabel = '';
      this.onChange('');
      return;
    }

    if (isNaN(d.getTime())) {
      this.gregorianLabel = '';
      this.onChange('');
      return;
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    if (this.calendarType === 'jalali') {
      this.gregorianLabel = `Miladi: ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } else {
      this.gregorianLabel = '';
    }

    this.onChange(iso);
  }
}
