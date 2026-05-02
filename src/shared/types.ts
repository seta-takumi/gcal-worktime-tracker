export interface WorkingHours {
  start: string;
  end: string;
}

export interface Interval {
  start: Date;
  end: Date;
}

export interface CalendarEventAttendee {
  self?: boolean;
  responseStatus?: string;
}

export interface CalendarEventTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface CalendarEvent {
  id?: string;
  summary?: string;
  transparency?: string;
  eventType?: string;
  start: CalendarEventTime;
  end: CalendarEventTime;
  attendees?: CalendarEventAttendee[];
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

export interface DayCacheEntry {
  workableMinutes: number;
  skipped: boolean;
}

export interface WeekCache {
  weekKey: string;
  updatedAt: number;
  days: Record<string, DayCacheEntry>;
}

export interface TodayRemainingResponse {
  ok: boolean;
  error?: string;
  minutes?: number | null;
  isWeekend?: boolean;
  isHoliday?: boolean;
  isAfterWork?: boolean;
  fromCache: boolean;
}

export interface WeeklyUpdateResponse {
  ok: boolean;
  error?: string;
}
