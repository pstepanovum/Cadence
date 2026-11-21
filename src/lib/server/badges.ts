// FILE: src/lib/server/badges.ts
//
// The streak lengths that earn a badge. The daily job mails one when a streak
// reaches each; the getting-started email names them. Pure, no imports.
export const BADGE_STREAKS = [7, 14, 30, 60, 100, 200, 365] as const;
