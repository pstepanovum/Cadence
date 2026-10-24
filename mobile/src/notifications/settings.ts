// The learner's reminder settings, kept on this phone (reminders are local
// notifications scheduled here, so they belong to the device).
import { storedValue } from "@/lib/stored-value";
import { DEFAULT_REMINDERS, parseReminderSettings, type ReminderSettings } from "@/notifications/plan";

export const reminderSettings = storedValue("cadence.reminders.v1", parseReminderSettings, DEFAULT_REMINDERS);

export function updateReminders(patch: Partial<ReminderSettings>): void {
  reminderSettings.set((current) => ({ ...current, ...patch, quiet: { ...current.quiet, ...(patch.quiet ?? {}) } }));
}

export const useReminderSettings = reminderSettings.use;
