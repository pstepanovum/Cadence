import SwiftUI
import WidgetKit

@main
struct CadenceWidgets: WidgetBundle {
  var body: some Widget {
    CadenceStreakWidget()
    CadenceWordWidget()
  }
}

struct CadenceEntry: TimelineEntry {
  let date: Date
  let day: CadenceDay
}

struct CadenceProvider: TimelineProvider {
  func placeholder(in context: Context) -> CadenceEntry {
    CadenceEntry(date: .now, day: .sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (CadenceEntry) -> Void) {
    let snapshot = SnapshotStore.load()
    if context.isPreview && snapshot == nil {
      completion(CadenceEntry(date: .now, day: .sample))
      return
    }
    completion(CadenceEntry(date: .now, day: CadenceDay(snapshot: snapshot, date: .now)))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<CadenceEntry>) -> Void) {
    let snapshot = SnapshotStore.load()
    let now = Date()
    let dates = [now] + CadenceDay.refreshDates(after: now, snapshot: snapshot)
    let entries = dates.map { CadenceEntry(date: $0, day: CadenceDay(snapshot: snapshot, date: $0)) }
    // The app reloads the widgets whenever practice changes; this is only a safety net.
    completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(6 * 3600))))
  }
}

/// The streak and today's goal: Home Screen small, Lock Screen circular and inline.
struct CadenceStreakWidget: Widget {
  let kind = "CadenceStreakWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: CadenceProvider()) { entry in
      StreakWidgetView(entry: entry)
    }
    .configurationDisplayName("Streak")
    .description("Your streak and today's practice goal.")
    .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryInline])
  }
}

/// The word of the day with its sounds; a tap opens it to practise.
struct CadenceWordWidget: Widget {
  let kind = "CadenceWordWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: CadenceProvider()) { entry in
      WordWidgetView(entry: entry)
    }
    .configurationDisplayName("Word of the day")
    .description("A new word each day, with how to say it.")
    .supportedFamilies([.systemMedium])
  }
}

// MARK: - Look

/// Cadence's tokens from src/theme/theme.ts: cream and hunter green in light, deep green and
/// lime in dark. In tinted and clear modes the system recolours everything, so the palette
/// falls back to primary opacities and lets `widgetAccentable` pick out what matters.
struct Palette {
  let background: Color
  let text: Color
  let muted: Color
  let accent: Color
  let ring: Color
  let track: Color

  init(scheme: ColorScheme, mode: WidgetRenderingMode) {
    if mode != .fullColor {
      background = .clear
      text = .primary
      muted = .primary.opacity(0.7)
      accent = .primary
      ring = .primary
      track = .primary.opacity(0.2)
    } else if scheme == .dark {
      background = Color(hex: 0x141C17)
      text = Color(hex: 0xF1F3EF)
      muted = Color(hex: 0xA6B1AA)
      accent = Color(hex: 0xA7C957)
      ring = Color(hex: 0xA7C957)
      track = Color(hex: 0x2A362F)
    } else {
      background = Color(hex: 0xF2E8CF)
      text = Color(hex: 0x244A2C)
      muted = Color(hex: 0x5C646B)
      accent = Color(hex: 0x386641)
      ring = Color(hex: 0x6A994E)
      track = Color(hex: 0xDEE2E6)
    }
  }
}

extension Color {
  init(hex: UInt32) {
    self.init(
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255
    )
  }
}

extension Font {
  /// Funnel Display, bundled with the extension and registered in its Info.plist; the system
  /// face if it ever fails to load.
  static func cadence(_ size: CGFloat, bold: Bool = true) -> Font {
    let name = bold ? "FunnelDisplay-Bold" : "FunnelDisplay-Medium"
    return UIFont(name: name, size: size) != nil
      ? .custom(name, fixedSize: size)
      : .system(size: size, weight: bold ? .bold : .medium)
  }
}

struct CadenceMark: View {
  let color: Color
  var size: CGFloat = 16

  var body: some View {
    Image("CadenceMark")
      .resizable()
      .renderingMode(.template)
      .aspectRatio(contentMode: .fit)
      .frame(width: size, height: size)
      .foregroundStyle(color)
      .accessibilityHidden(true)
  }
}

struct GoalRing: View {
  let day: CadenceDay
  let palette: Palette
  var lineWidth: CGFloat = 7

  var body: some View {
    ZStack {
      Circle().stroke(palette.track, lineWidth: lineWidth)
      Circle()
        .trim(from: 0, to: day.goalProgress)
        .stroke(palette.ring, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        .rotationEffect(.degrees(-90))
        .widgetAccentable()
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(day.minutesToday) of \(day.goalMinutes) minutes today")
  }
}

// MARK: - Streak

struct StreakWidgetView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.widgetRenderingMode) private var renderingMode

  let entry: CadenceEntry

  var body: some View {
    let palette = Palette(scheme: colorScheme, mode: renderingMode)
    Group {
      switch family {
      case .accessoryCircular:
        CircularView(day: entry.day)
      case .accessoryInline:
        InlineView(day: entry.day)
      default:
        SmallView(day: entry.day, palette: palette)
      }
    }
    .widgetURL(WidgetLink.home)
    .containerBackground(for: .widget) {
      switch family {
      case .accessoryCircular, .accessoryInline:
        AccessoryWidgetBackground()
      default:
        palette.background
      }
    }
  }
}

struct SmallView: View {
  let day: CadenceDay
  let palette: Palette

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        CadenceMark(color: palette.accent, size: 22)
          .widgetAccentable()
        Spacer(minLength: 4)
        Text(day.message)
          .font(.cadence(12, bold: false))
          .foregroundStyle(palette.muted)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
      Spacer(minLength: 4)
      HStack(alignment: .center, spacing: 10) {
        VStack(alignment: .leading, spacing: -2) {
          HStack(alignment: .firstTextBaseline, spacing: 3) {
            Image(systemName: "flame.fill")
              .font(.system(size: 16, weight: .bold))
              .foregroundStyle(palette.accent)
              .widgetAccentable()
            Text("\(day.streak)")
              .font(.cadence(40))
              .foregroundStyle(palette.text)
              .monospacedDigit()
              .minimumScaleFactor(0.5)
              .lineLimit(1)
          }
          Text("day streak")
            .font(.cadence(12, bold: false))
            .foregroundStyle(palette.muted)
            .lineLimit(1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(day.streak)-day streak")
        Spacer(minLength: 0)
      }
      Spacer(minLength: 6)
      HStack(spacing: 8) {
        GoalRing(day: day, palette: palette, lineWidth: 5)
          .frame(width: 26, height: 26)
        Text("\(day.minutesToday)/\(day.goalMinutes) min")
          .font(.cadence(14))
          .foregroundStyle(palette.text)
          .monospacedDigit()
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct CircularView: View {
  let day: CadenceDay

  var body: some View {
    Gauge(value: day.goalProgress) {
      Image(systemName: "flame.fill")
    } currentValueLabel: {
      VStack(spacing: -2) {
        Image(systemName: "flame.fill")
          .font(.system(size: 10, weight: .bold))
          .widgetAccentable()
        Text("\(day.streak)")
          .font(.cadence(18))
          .monospacedDigit()
          .minimumScaleFactor(0.6)
      }
    }
    .gaugeStyle(.accessoryCircularCapacity)
    .accessibilityLabel("\(day.streak)-day streak, \(day.minutesToday) of \(day.goalMinutes) minutes today")
  }
}

struct InlineView: View {
  let day: CadenceDay

  var body: some View {
    // One line of system text; the Lock Screen chooses the font.
    Label {
      Text(day.goalMet ? "Goal done · \(day.streak)-day streak" : "\(day.minutesToday) of \(day.goalMinutes) min · \(day.streak)-day streak")
    } icon: {
      Image(systemName: day.goalMet ? "checkmark.circle.fill" : "flame.fill")
    }
  }
}

// MARK: - Word of the day

struct WordWidgetView: View {
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.widgetRenderingMode) private var renderingMode

  let entry: CadenceEntry

  var body: some View {
    let palette = Palette(scheme: colorScheme, mode: renderingMode)
    let word = entry.day.word ?? CadenceDay.sample.word
    HStack(alignment: .top, spacing: 14) {
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 6) {
          CadenceMark(color: palette.accent, size: 18)
            .widgetAccentable()
          Text("Word of the day")
            .font(.cadence(12, bold: false))
            .foregroundStyle(palette.muted)
            .lineLimit(1)
        }
        Spacer(minLength: 4)
        Text(word?.word ?? "")
          .font(.cadence(28))
          .foregroundStyle(palette.text)
          .lineLimit(1)
          .minimumScaleFactor(0.6)
        Text(word?.ipa ?? "")
          .font(.cadence(15, bold: false))
          .foregroundStyle(palette.accent)
          .lineLimit(1)
          .widgetAccentable()
        Spacer(minLength: 4)
        Text(word?.definition ?? "")
          .font(.cadence(12, bold: false))
          .foregroundStyle(palette.muted)
          .lineLimit(2)
          .minimumScaleFactor(0.85)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)

      VStack {
        Spacer(minLength: 0)
        Label("Practise", systemImage: "mic.fill")
          .font(.cadence(13))
          .foregroundStyle(palette.background == .clear ? palette.text : Color(hex: 0xF8F9FA))
          .padding(.horizontal, 12)
          .frame(height: 34)
          .background(Capsule().fill(palette.background == .clear ? palette.track : Color(hex: 0x386641)))
          .widgetAccentable()
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Word of the day: \(word?.word ?? ""), \(word?.ipa ?? ""). \(word?.definition ?? ""). Tap to practise.")
    .widgetURL(word.map { WidgetLink.word($0.id) } ?? WidgetLink.home)
    .containerBackground(for: .widget) { palette.background }
  }
}

// MARK: - Samples

extension CadenceDay {
  static var sample: CadenceDay {
    let calendar = Calendar.current
    let today = DayKey.key(for: .now, in: calendar)
    let snapshot = CadenceSnapshot(
      version: 1,
      updatedAt: Date.now.timeIntervalSince1970 * 1000,
      today: today,
      timeZone: calendar.timeZone.identifier,
      streak: 6,
      freezes: 0,
      practisedToday: true,
      goalMinutes: 10,
      minutesToday: 7,
      words: [.init(day: today, id: "ev-07", word: "commute", ipa: "/kəˈmjut/", definition: "To travel regularly between home and work.")]
    )
    return CadenceDay(snapshot: snapshot, date: .now)
  }
}

#Preview("Small", as: .systemSmall) {
  CadenceStreakWidget()
} timeline: {
  CadenceEntry(date: .now, day: .sample)
  CadenceEntry(date: .now, day: CadenceDay(snapshot: nil, date: .now))
}

#Preview("Medium", as: .systemMedium) {
  CadenceWordWidget()
} timeline: {
  CadenceEntry(date: .now, day: .sample)
}

#Preview("Circular", as: .accessoryCircular) {
  CadenceStreakWidget()
} timeline: {
  CadenceEntry(date: .now, day: .sample)
}

#Preview("Inline", as: .accessoryInline) {
  CadenceStreakWidget()
} timeline: {
  CadenceEntry(date: .now, day: .sample)
}
