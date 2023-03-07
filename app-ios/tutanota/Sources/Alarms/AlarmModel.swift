import Foundation

struct EventOccurrence {
  let occurrenceNumber: Int
  let occurenceDate: Date
}

struct AlarmOccurence : Equatable {
  let occurrenceNumber: Int
  let eventOccurrenceTime: Date
  let alarm: AlarmNotification
  
  func alarmOccurenceTime() -> Date {
    return AlarmModel.alarmTime(trigger: alarm.alarmInfo.trigger, eventTime: eventOccurrenceTime)
  }
}

struct LazyEventSequence : Sequence, IteratorProtocol {
  let calcEventStart: Date
  let endDate: Date?
  let repeatRule: RepeatRule
  let cal: Calendar
  let calendarComponent: Calendar.Component
  
  fileprivate var ocurrenceNumber = 0
  
  mutating func next() -> EventOccurrence? {
    if case let .count(n) = repeatRule.endCondition, ocurrenceNumber >= n {
      return nil
    }
    let occurrenceDate = cal.date(
      byAdding: self.calendarComponent,
      value: repeatRule.interval * ocurrenceNumber,
      to: calcEventStart
    )!
    if let endDate = endDate, occurrenceDate >= endDate  {
      return nil
    } else {
      let occurrence = EventOccurrence(
        occurrenceNumber: ocurrenceNumber,
        occurenceDate: occurrenceDate
      )
      ocurrenceNumber += 1
      return occurrence
    }
  }
}

class AlarmModel {
  private let perAlarmLimit: Int
  private let overallAlarmLimit: Int
  private let dateProvider: DateProvider
  
  init(perAlarmLimit: Int, overallAlarmLimit: Int, dateProvider: DateProvider) {
    self.perAlarmLimit = perAlarmLimit
    self.overallAlarmLimit = overallAlarmLimit
    self.dateProvider = dateProvider
  }
  
  func plan(alarms: [AlarmNotification]) -> some BidirectionalCollection<AlarmOccurence> {
    var occurrences = [AlarmOccurence]()
    
    for alarm in alarms {
      occurrences += self.futureOccurrencesOf(alarm: alarm)
    }
    
    occurrences.sort(by: { $0.eventOccurrenceTime < $1.eventOccurrenceTime })
    return occurrences.prefix(overallAlarmLimit)
  }
  
  func futureOccurrencesOf(alarm: AlarmNotification) -> any Sequence<AlarmOccurence> {
    if let repeatRule = alarm.repeatRule {
      return self.futureOccurencesOf(alarm: alarm, withRepeatRule: repeatRule)
    } else {
      let singleOcurrence = AlarmOccurence(
        occurrenceNumber: 0,
        eventOccurrenceTime: alarm.eventStart,
        alarm: alarm
      )
      if shouldScheduleAlarmAt(ocurrenceTime: singleOcurrence.alarmOccurenceTime()) {
        return [singleOcurrence]
      } else {
        return []
      }
    }
  }
  
  private func futureOccurencesOf(
    alarm: AlarmNotification,
    withRepeatRule: RepeatRule
  ) -> some Sequence<AlarmOccurence> {
    let occurencesAfterNow = occurencesOfRepeatingEvent(
      eventStart: alarm.eventStart,
      eventEnd: alarm.eventEnd,
      repeatRule: withRepeatRule,
      localTimeZone: TimeZone.current
    )
      .lazy
      .filter { self.shouldScheduleAlarmAt(ocurrenceTime: $0.occurenceDate) }
      .map { occurrence in
        return AlarmOccurence(
          occurrenceNumber: occurrence.occurrenceNumber,
          eventOccurrenceTime: occurrence.occurenceDate,
          alarm: alarm
        )
      }
      .filter { self.shouldScheduleAlarmAt(ocurrenceTime: $0.alarmOccurenceTime()) }

    return occurencesAfterNow
      .prefix(perAlarmLimit)
  }
  
  private func shouldScheduleAlarmAt(ocurrenceTime: Date) -> Bool {
    let now = dateProvider.now
    let fortNightSeconds: Double = 60 * 60 * 24 * 14
    
    return ocurrenceTime > now && ocurrenceTime.timeIntervalSince(now) < fortNightSeconds
  }
  
  private func occurencesOfRepeatingEvent(
    eventStart: Date,
    eventEnd: Date,
    repeatRule: RepeatRule,
    localTimeZone: TimeZone
  ) -> LazyEventSequence {
    var cal = Calendar.current
    let calendarUnit = calendarUnit(for: repeatRule.frequency)
    
    let isAllDayEvent = isAllDayEvent(startTime: eventStart, endTime: eventEnd)
    let calcEventStart = isAllDayEvent ? allDayDateLocal(dateUTC: eventStart) : eventStart
    let endDate: Date?
    switch repeatRule.endCondition {
    case let .untilDate(valueDate):
      if isAllDayEvent {
        endDate = allDayDateLocal(dateUTC: valueDate)
      } else {
        endDate = valueDate
      }
    default:
      endDate = nil
    }
    
    cal.timeZone = isAllDayEvent ? localTimeZone : TimeZone(identifier: repeatRule.timeZone) ?? localTimeZone
    
    return LazyEventSequence(calcEventStart: calcEventStart, endDate: endDate, repeatRule: repeatRule, cal: cal, calendarComponent: calendarUnit)
  }
  
  static func alarmTime(trigger: String, eventTime: Date) -> Date {
    let cal = Calendar.current
    switch trigger {
    case "5M":
      return cal.date(byAdding: .minute, value: -5, to: eventTime)!
    case "10M":
      return cal.date(byAdding: .minute, value: -10, to: eventTime)!
    case "30M":
      return cal.date(byAdding: .minute, value: -30, to: eventTime)!
    case "1H":
      return cal.date(byAdding: .hour, value: -1, to: eventTime)!
    case "1D":
      return cal.date(byAdding: .day, value: -1, to: eventTime)!
    case "2D":
      return cal.date(byAdding: .day, value: -2, to: eventTime)!
    case "3D":
      return cal.date(byAdding: .day, value: -3, to: eventTime)!
    case "1W":
      return cal.date(byAdding: .weekOfYear, value: -1, to: eventTime)!
    default:
      return cal.date(byAdding: .minute, value: -5, to: eventTime)!
    }
  }
  
  static func allDayDateUTC(date: Date) -> Date {
    let calendar = Calendar.current
    var localComponents = calendar.dateComponents([.year, .month, .day], from: date)
    let timeZone = TimeZone(identifier: "UTC")!
    localComponents.timeZone = timeZone
    return calendar.date(from: localComponents)!
  }
}

func allDayDateLocal(dateUTC: Date) -> Date {
  var calendar = Calendar.current
  let timeZone = TimeZone(identifier: "UTC")!
  calendar.timeZone = timeZone
  let components = calendar.dateComponents([.year, .month, .day], from: dateUTC)
  calendar.timeZone = TimeZone.current
  return calendar.date(from: components)!
}

private func isAllDayEvent(startTime: Date, endTime: Date) -> Bool {
  var calendar = Calendar.current
  calendar.timeZone = TimeZone(abbreviation: "UTC")!
  
  let startComponents = calendar.dateComponents([.hour, .minute, .second], from: startTime)
  let startsOnZero = startComponents.hour == 0
  && startComponents.minute == 0
  && startComponents.second == 0
  
  let endComponents = calendar.dateComponents([.hour, .minute,.second], from: endTime)
  let endsOnZero = endComponents.hour == 0
  && endComponents.minute == 0
  && endComponents.second == 0
  
  return startsOnZero && endsOnZero
}

private func calendarUnit(for repeatPeriod: RepeatPeriod) -> Calendar.Component {
  switch (repeatPeriod) {
  case .daily:
    return .day
  case .weekly:
    return .weekOfYear
  case .monthly:
    return .month
  case .annually:
    return .year
  }
}
