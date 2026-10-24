import Foundation

/// The App Group the app writes into. Must match `APP_GROUP` in src/lib/widget/sync.ios.ts
/// and the entitlement in app.json.
let appGroup = "group.dev.pstepanov.cadence"
let snapshotKey = "cadence.widget.snapshot"

enum WidgetLink {
  /// Mirrors `WIDGET_LINKS` in src/lib/widget/snapshot.ts.
  static let home = URL(string: "cadence:///")!

  static func word(_ id: String) -> URL {
    let escaped = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
    return URL(string: "cadence:///word/\(escaped)") ?? home
  }
}

/// The JSON the app writes; see `CadenceWidgetSnapshot` in src/lib/widget/snapshot.ts.
struct CadenceSnapshot: Codable, Equatable {
  struct Word: Codable, Equatable {
    let day: String
    let id: String
    let word: String
    let ipa: String
    let definition: String
  }

  let version: Int
  let updatedAt: Double
  let today: String
  let timeZone: String
  let streak: Int
  let freezes: Int
  let practisedToday: Bool
  let goalMinutes: Int
  let minutesToday: Int
  let words: [Word]
}

enum SnapshotStore {
  static func load() -> CadenceSnapshot? {
    guard let defaults = UserDefaults(suiteName: appGroup),
          let raw = defaults.string(forKey: snapshotKey),
          let data = raw.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(CadenceSnapshot.self, from: data)
  }
}

/// Calendar dates as `YYYY-MM-DD`, the same keys the app uses. Arithmetic happens at
/// noon UTC so a daylight saving change never lands on the neighbouring date.
enum DayKey {
  private static let utc: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    return calendar
  }()

  static func calendar(for zone: String?) -> Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone.flatMap { TimeZone(identifier: $0) } ?? .current
    return calendar
  }

  static func key(for date: Date, in calendar: Calendar) -> String {
    let parts = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
  }

  private static func noon(_ key: String) -> Date? {
    let parts = key.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return utc.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
  }

  static func between(_ from: String, _ to: String) -> Int {
    guard let start = noon(from), let end = noon(to) else { return 0 }
    return Int((end.timeIntervalSince(start) / 86_400).rounded())
  }
}

/// What one timeline entry shows, after rolling the snapshot forward to the entry's day.
/// Mirrors `advanceSnapshot` in src/lib/widget/snapshot.ts.
struct CadenceDay {
  let isEmpty: Bool
  let streak: Int
  let practisedToday: Bool
  let minutesToday: Int
  let goalMinutes: Int
  let word: CadenceSnapshot.Word?

  var goalProgress: Double {
    guard goalMinutes > 0 else { return 0 }
    return min(1, Double(minutesToday) / Double(goalMinutes))
  }

  var goalMet: Bool { minutesToday >= goalMinutes }

  /// Kind and short, like the app's own copy.
  var message: String {
    if isEmpty { return "Start today" }
    if goalMet { return "Goal done" }
    if streak > 0 && !practisedToday { return "Keep it going" }
    return "\(max(0, goalMinutes - minutesToday)) min to go"
  }

  init(snapshot: CadenceSnapshot?, date: Date) {
    guard let snapshot else {
      isEmpty = true
      streak = 0
      practisedToday = false
      minutesToday = 0
      goalMinutes = 10
      word = nil
      return
    }
    isEmpty = false
    goalMinutes = snapshot.goalMinutes
    let day = DayKey.key(for: date, in: DayKey.calendar(for: snapshot.timeZone))
    word = snapshot.words.first(where: { $0.day == day }) ?? snapshot.words.last
    if day <= snapshot.today {
      streak = snapshot.streak
      practisedToday = snapshot.practisedToday
      minutesToday = snapshot.minutesToday
    } else {
      // Each fully missed day spends a freeze; with none left the streak shows 0.
      let gap = DayKey.between(snapshot.today, day)
      let missed = gap - 1 + (snapshot.practisedToday ? 0 : 1)
      streak = missed <= snapshot.freezes ? snapshot.streak : 0
      practisedToday = false
      minutesToday = 0
    }
  }

  /// Redraw at each of the next eight midnights, so a new day starts fresh on time.
  static func refreshDates(after now: Date, snapshot: CadenceSnapshot?) -> [Date] {
    let calendar = DayKey.calendar(for: snapshot?.timeZone)
    let start = calendar.startOfDay(for: now)
    return (1...8).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }.filter { $0 > now }
  }
}
