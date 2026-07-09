export interface Member { id: string; name: string; role: string; initial: string; color: string; you: boolean; }
export interface EventItem { id: string; title: string; time: string; ampm: string; day: string; date_label: string; loc: string; color: string; illo: string; event_date?: string | null; event_time?: string | null; assignee_ids?: string[] | null; external?: boolean; recur?: string; remind_days?: number; }
export interface CalendarSource { id: string; name: string; color: string; count: number; last_synced: string | null; error: string | null; }
export interface Task { id: string; title: string; from_name: string; from_color: string; due: string; due_key: string; due_date?: string | null; due_time?: string; done: boolean; type: string; assignee_ids?: string[] | null; recur?: string; }
export interface ShoppingItem { id: string; name: string; by: string; got: boolean; }
export interface Goal { id: string; kind: string; tag: string; title: string; sub: string; pct: number; color: string; target: number; }
export interface Bill { id: string; name: string; cat: string; amount: number; due: string; status: string; payer: string; color: string; illo: string; due_date?: string | null; assignee_ids?: string[] | null; recur?: string; remind_days?: number; }
export interface BudgetCat { id: string; name: string; spent: number; limit: number; color: string; }
export interface Saving { id: string; name: string; saved: number; target: number; color: string; }
export interface Settle { id: string; txt: string; detail: string; amount: string; dir: string; who: string; settled: boolean; member_id?: string | null; mine?: boolean; }
export interface Notification { id: string; illo: string; color: string; title: string; body: string; time_label: string; unread: boolean; }
export interface FeedItem { id: string; who: string; color: string; initial: string; txt: string; time_label: string; }

export type EmailCadence = 'off' | 'daily' | 'weekly' | 'both';
export interface Settings {
  push?: boolean; email?: boolean; emailCadence?: EmailCadence; appleCal?: boolean; googleCal?: boolean;
  iphoneReminders?: boolean; faceId?: boolean; backup?: boolean;
}

export interface BudgetMonth { budget_id: string; month: string; total: number; }
export interface Meal { id: string; date: string; title: string; }
export interface HouseholdInfo { id: string; category: string; label: string; value: string; }
export interface BudgetSpend { id: string; budget_id: string; amount: number; note: string; date: string; month: string; }

export interface AppState {
  household: { name: string; settings: Settings };
  members: Member[];
  events: EventItem[];
  tasks: Task[];
  shopping: ShoppingItem[];
  goals: Goal[];
  bills: Bill[];
  budget: BudgetCat[];
  budgetMonths?: BudgetMonth[];
  budgetSpends?: BudgetSpend[];
  savings: Saving[];
  settle: Settle[];
  notifications: Notification[];
  feed: FeedItem[];
  calendarSources?: CalendarSource[];
  meals?: Meal[];
  householdInfo?: HouseholdInfo[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  household_id: string | null;
  household_name: string | null;
  onboarded?: boolean;
  locked?: boolean;
}
