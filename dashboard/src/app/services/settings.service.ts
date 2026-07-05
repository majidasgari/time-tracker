import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type CalendarType = 'gregorian' | 'jalali';

const STORAGE_KEY = 'tt_calendar_type';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private _calendarType: CalendarType = 'gregorian';
  readonly calendarType$ = new BehaviorSubject<CalendarType>(this._calendarType);

  constructor() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'jalali' || stored === 'gregorian') {
      this._calendarType = stored;
      this.calendarType$.next(stored);
    }
  }

  get calendarType(): CalendarType {
    return this._calendarType;
  }

  set calendarType(type: CalendarType) {
    this._calendarType = type;
    localStorage.setItem(STORAGE_KEY, type);
    this.calendarType$.next(type);
  }

  get isJalali(): boolean {
    return this._calendarType === 'jalali';
  }

  parseDateTimeLocal(value: string): Date {
    if (!value) return new Date(NaN);
    const [datePart, timePart] = value.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const [hh, mm] = (timePart || '00:00').split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm);
  }

  fmtDate(ts: string, withTime = false): string {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (!withTime) return date;
    return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}
