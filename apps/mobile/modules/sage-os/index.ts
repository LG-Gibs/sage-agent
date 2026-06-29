import { requireNativeModule } from 'expo-modules-core';

/**
 * Native OS bridge for Contacts, Calendar, Reminders, and sandboxed File
 * System. Every method requests the relevant permission and rejects with a
 * message prefixed "permission_denied" when access is refused.
 */
export interface SageOsNativeModule {
  contactsRead(query: string | null, limit: number): Promise<Array<{ name: string; phones: string[]; emails: string[] }>>;
  calendarCreate(title: string, startISO: string, endISO: string, location: string | null, notes: string | null): Promise<{ id: string }>;
  calendarQuery(startISO: string, endISO: string): Promise<Array<{ id: string; title: string; startISO: string; endISO: string }>>;
  reminderCreate(title: string, dueISO: string | null, notes: string | null): Promise<{ id: string }>;
  reminderList(includeCompleted: boolean, limit: number): Promise<Array<{ id: string; title: string; completed: boolean; dueISO: string | null }>>;
  fileRead(path: string): Promise<{ content: string }>;
  fileWrite(path: string, content: string): Promise<{ bytes: number }>;
  fileList(path: string): Promise<Array<{ name: string; isDir: boolean; size: number }>>;
}

export default requireNativeModule<SageOsNativeModule>('SageOs');
