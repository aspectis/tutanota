import Foundation

struct AlarmOccurrence {
  let occurrenceNumber: Int
  let occurenceDate: Date
}

struct LazyAlarmSequence : Sequence, IteratorProtocol {
  let calcEventStart: Date
  let endDate: Date?
  let repeatRule: RepeatRule
  let cal: Calendar
  let calendarComponent: Calendar.Component
  
  fileprivate var ocurrenceNumber = 0
  
  mutating func next() -> AlarmOccurrence? {
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
      ocurrenceNumber += 1
      return AlarmOccurrence(occurrenceNumber: ocurrenceNumber, occurenceDate: occurrenceDate)
    }
  }
}

class AlarmModel {
  static func iterateRepeatingAlarm(
    eventStart: Date,
    eventEnd: Date,
    repeatRule: RepeatRule,
    localTimeZone: TimeZone
  ) -> LazyAlarmSequence {
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
    
    return LazyAlarmSequence(calcEventStart: calcEventStart, endDate: endDate, repeatRule: repeatRule, cal: cal, calendarComponent: calendarUnit)
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
