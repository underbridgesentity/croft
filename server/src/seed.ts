import type { PoolClient } from 'pg';

/**
 * Seed a brand-new household with warm starter content so every screen is
 * populated from the first launch (mirrors the Hearth design). The signing-up
 * user becomes the "You" member; the rest is editable sample family data.
 */
export async function seedHousehold(
  c: PoolClient,
  householdId: string,
  userName: string
) {
  const youName = (userName || 'You').trim() || 'You';
  const youInitial = youName.charAt(0).toUpperCase() || 'Y';

  // --- members ---
  const members = [
    { name: youName, role: 'Parent', initial: youInitial, color: '#3B5BFF', is_you: true, key: 'you' },
    { name: 'Naledi', role: 'Mom', initial: 'N', color: '#FF5C8A', is_you: false, key: 'naledi' },
    { name: 'Amara', role: 'Age 4', initial: 'A', color: '#FFB020', is_you: false, key: 'amara' },
    { name: 'Lwazi', role: 'Age 2', initial: 'L', color: '#16C098', is_you: false, key: 'lwazi' },
  ];
  const memberIds: Record<string, string> = {};
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const r = await c.query(
      `INSERT INTO members (household_id, name, role, initial, color, is_you, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [householdId, m.name, m.role, m.initial, m.color, m.is_you, i]
    );
    memberIds[m.key] = r.rows[0].id;
  }
  const youMemberId = memberIds['you'];

  // --- events ---
  const events = [
    ['Amara — Dentist check-up', '14:30', 'PM', 'today', 'Today', 'Dr. Pillay, Rosebank', '#FFB020', 'health'],
    ['Parent evening (Amara)', '18:00', 'PM', 'thu', 'Thu 9 Oct', 'Little Acorns Pre-school', '#FFB020', 'family'],
    ['Naledi — Work conference', 'All', 'day', 'fri', 'Fri 10 – Sat 11', 'Sandton Convention Centre', '#FF5C8A', 'calendar'],
    ['Lwazi — Vaccination', '09:15', 'AM', 'mon', 'Mon 13 Oct', 'Clinic · 6-month jabs', '#16C098', 'health'],
    ['Our anniversary', 'All', 'day', 'wed15', 'Wed 15 Oct', '7 years together', '#FF5C8A', 'heart'],
    ['Pay day', '', '', 'sat25', 'Sat 25 Oct', 'Salaries in', '#16C098', 'coin'],
  ];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    await c.query(
      `INSERT INTO events (household_id, title, time, ampm, day, date_label, loc, color, illo, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [householdId, ...e, i]
    );
  }

  // --- tasks ---
  const tasks = [
    ['Pick up nappies & wipes', 'Naledi', '#FF5C8A', 'Today', 'today', false, 'Reminder'],
    ['Defrost chicken for dinner', 'Naledi', '#FF5C8A', 'Today', 'today', false, 'Reminder'],
    ["Book Amara's swimming lessons", youName, '#3B5BFF', 'Tomorrow', 'tom', false, 'Task'],
    ['Call plumber about the geyser', 'Naledi', '#FF5C8A', 'Overdue', 'over', false, 'Task'],
    ['Renew car licence disc', youName, '#3B5BFF', 'Fri', 'fri', false, 'Task'],
    ["Pack Lwazi's clinic card", youName, '#3B5BFF', 'Mon', 'mon', false, 'Reminder'],
  ];
  for (let i = 0; i < tasks.length; i++) {
    await c.query(
      `INSERT INTO tasks (household_id, title, from_name, from_color, due, due_key, done, type, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [householdId, ...tasks[i], i]
    );
  }

  // --- shopping ---
  const shopping = [
    ['Nappies (size 4)', 'naledi', false],
    ['Baby wipes', 'naledi', false],
    ['Milk (2L)', 'you', false],
    ['Bread', 'you', true],
    ['Bananas', 'amara', false],
    ['Coffee', 'you', false],
    ['Dishwashing liquid', 'naledi', false],
    ['Yoghurt (kids)', 'naledi', true],
  ];
  for (let i = 0; i < shopping.length; i++) {
    await c.query(
      `INSERT INTO shopping (household_id, name, by_member, got, sort) VALUES ($1,$2,$3,$4,$5)`,
      [householdId, ...shopping[i], i]
    );
  }

  // --- goals ---
  const goals = [
    ['Family', 'Savings', 'December holiday fund', 'R9,300 of R15,000', 62, '#3B5BFF', 15000],
    ['Family', 'Habit', 'Family walk every Sunday', '5-week streak going strong', 80, '#16C098', 0],
    ['Family', 'Habit', 'Screen-free dinners', '4 of 7 nights this week', 57, '#FFB020', 0],
    [youName, 'Personal', 'Read 2 books this month', '1 of 2 done', 50, '#3B5BFF', 0],
    ['Naledi', 'Personal', 'Gym 3× a week', '2 of 3 this week', 66, '#FF5C8A', 0],
  ];
  for (let i = 0; i < goals.length; i++) {
    await c.query(
      `INSERT INTO goals (household_id, kind, tag, title, sub, pct, color, target, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [householdId, ...goals[i], i]
    );
  }

  // --- bills ---
  const bills = [
    ['Bond / Home loan', 'Housing', 12500, '1 Oct', 'paid', youName, '#3B5BFF', 'house'],
    ['Electricity', 'Utilities', 1450, '28 Oct', 'unpaid', 'Shared', '#FFB020', 'alarm'],
    ['School fees — Amara', 'Kids', 3200, '20 Oct', 'overdue', 'Naledi', '#FF5C8A', 'family'],
    ['Medical aid', 'Health', 4100, '1 Oct', 'paid', youName, '#16C098', 'health'],
    ['Fibre internet', 'Utilities', 899, '26 Oct', 'unpaid', youName, '#3B5BFF', 'cloud'],
    ['Car instalment', 'Transport', 4800, '3 Oct', 'paid', 'Naledi', '#FFB020', 'wallet'],
  ];
  for (let i = 0; i < bills.length; i++) {
    await c.query(
      `INSERT INTO bills (household_id, name, cat, amount, due, status, payer, color, illo, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [householdId, ...bills[i], i]
    );
  }

  // --- budget ---
  const budget = [
    ['Groceries', 4200, 6000, '#3B5BFF'],
    ['Transport / fuel', 2650, 3000, '#16C098'],
    ['Kids', 1800, 2500, '#FFB020'],
    ['Eating out', 1400, 1200, '#FF4D5E'],
    ['Savings', 3000, 3000, '#7A5CFF'],
  ];
  for (let i = 0; i < budget.length; i++) {
    await c.query(
      `INSERT INTO budget (household_id, name, spent, budget_limit, color, sort) VALUES ($1,$2,$3,$4,$5,$6)`,
      [householdId, ...budget[i], i]
    );
  }

  // --- savings ---
  const savings = [
    ['December holiday', 9300, 15000, '#3B5BFF'],
    ['Emergency fund', 22000, 50000, '#16C098'],
    ['New fridge', 3200, 9000, '#FF5C8A'],
  ];
  for (let i = 0; i < savings.length; i++) {
    await c.query(
      `INSERT INTO savings (household_id, name, saved, target, color, sort) VALUES ($1,$2,$3,$4,$5,$6)`,
      [householdId, ...savings[i], i]
    );
  }

  // --- settle ---
  const settle = [
    ["You paid R450 for Amara's shoes", 'Naledi owes you', 'R225', 'in', 'Naledi'],
    ['Naledi paid R680 for groceries', 'You owe Naledi', 'R340', 'out', 'Naledi'],
  ];
  for (let i = 0; i < settle.length; i++) {
    await c.query(
      `INSERT INTO settle (household_id, txt, detail, amount, dir, who, sort) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [householdId, ...settle[i], i]
    );
  }

  // --- notifications ---
  const notifs = [
    ['bell', '#FF5C8A', 'Reminder from Naledi', 'Pick up nappies & wipes on your way home', '8m ago', true],
    ['calendar', '#FFB020', 'Today · Amara — Dentist check-up', '14:30 · Dr. Pillay, Rosebank', '1h ago', true],
    ['wallet', '#FF4D5E', 'Bill overdue', 'School fees — Amara (R3,200) was due 20 Oct', '2h ago', true],
    ['check', '#16C098', 'Naledi completed a task', 'Marked "Pay school fees" as done', 'Yesterday', false],
    ['cart', '#3B5BFF', 'Naledi added to Shopping list', 'Nappies (size 4), Baby wipes', 'Yesterday', false],
  ];
  for (const n of notifs) {
    await c.query(
      `INSERT INTO notifications (household_id, illo, color, title, body, time_label, unread)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [householdId, ...n]
    );
  }

  // --- feed ---
  const feed = [
    ['Naledi', '#FF5C8A', 'N', 'added Nappies & Wipes to the shopping list', '8m'],
    ['You', '#3B5BFF', youInitial, 'completed "Pay school fees"', '1h'],
    ['Naledi', '#FF5C8A', 'N', 'marked the Car instalment as paid', '3h'],
    ['Naledi', '#FF5C8A', 'N', 'set a new family goal: Sunday walks', '1d'],
  ];
  for (const f of feed) {
    await c.query(
      `INSERT INTO feed (household_id, who, color, initial, txt, time_label) VALUES ($1,$2,$3,$4,$5,$6)`,
      [householdId, ...f]
    );
  }

  // default settings
  await c.query(
    `UPDATE households SET settings = $2 WHERE id = $1`,
    [
      householdId,
      JSON.stringify({
        push: true,
        email: true,
        appleCal: true,
        googleCal: false,
        iphoneReminders: true,
        faceId: true,
        backup: true,
      }),
    ]
  );

  return { youMemberId, memberIds };
}
