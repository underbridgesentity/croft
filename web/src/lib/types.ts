export interface Member { id: string; name: string; role: string; initial: string; color: string; you: boolean; }
export interface EventItem { id: string; title: string; time: string; ampm: string; day: string; date_label: string; loc: string; color: string; illo: string; }
export interface Task { id: string; title: string; from_name: string; from_color: string; due: string; due_key: string; done: boolean; type: string; }
export interface ShoppingItem { id: string; name: string; by: string; got: boolean; }
export interface Goal { id: string; kind: string; tag: string; title: string; sub: string; pct: number; color: string; target: number; }
export interface Bill { id: string; name: string; cat: string; amount: number; due: string; status: string; payer: string; color: string; illo: string; }
export interface BudgetCat { id: string; name: string; spent: number; limit: number; color: string; }
export interface Saving { id: string; name: string; saved: number; target: number; color: string; }
export interface Settle { id: string; txt: string; detail: string; amount: string; dir: string; who: string; settled: boolean; }
export interface Notification { id: string; illo: string; color: string; title: string; body: string; time_label: string; unread: boolean; }
export interface FeedItem { id: string; who: string; color: string; initial: string; txt: string; time_label: string; }

export interface Settings {
  push?: boolean; email?: boolean; appleCal?: boolean; googleCal?: boolean;
  iphoneReminders?: boolean; faceId?: boolean; backup?: boolean;
}

export interface AppState {
  household: { name: string; settings: Settings };
  members: Member[];
  events: EventItem[];
  tasks: Task[];
  shopping: ShoppingItem[];
  goals: Goal[];
  bills: Bill[];
  budget: BudgetCat[];
  savings: Saving[];
  settle: Settle[];
  notifications: Notification[];
  feed: FeedItem[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  household_id: string | null;
  household_name: string | null;
  onboarded?: boolean;
}
