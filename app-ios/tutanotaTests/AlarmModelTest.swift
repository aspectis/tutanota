import Foundation
import XCTest
@testable import tutanota

class AlarmModelTest : XCTestCase {
  let perAlarmLimit = 5
  let overallAlarmLimit = 10
  
  var dateProvider: DateProviderStub!
  var alarmModel: AlarmModel!
  
  override func setUp() {
    dateProvider = DateProviderStub()
    alarmModel = AlarmModel(
      perAlarmLimit: perAlarmLimit,
      overallAlarmLimit: overallAlarmLimit,
      dateProvider: dateProvider
    )
  }
  
  func testPlanWhenSingleInRecentFutureItIsPlanned() {
    let start = dateProvider.now.advanced(by: 10, .minutes)
    let alarm = makeAlarm(at: start, trigger: "5M")
    
    let result = plan(alarms: [alarm])
    let expectedAlarmOccurence = AlarmOccurence(
      occurrenceNumber: 0,
      eventOccurrenceTime: start,
      alarm: alarm
    )
    XCTAssertEqual(result, [expectedAlarmOccurence])
  }
  
  func testPlanWhenSingleInThePastItIsNotPlanned() {
    let start = dateProvider.now.advanced(by: 2, .minutes)
    let alarm = makeAlarm(at: start, trigger: "5M")
    
    let result = plan(alarms: [alarm])
    XCTAssertEqual(result, [])
  }
  
    func testPlanWhenRepeatedAlarmStartsAfterNowAllOcurrencesArePlanned() {
      let start = dateProvider.now.advanced(by: 10, .minutes)
      let alarm = makeAlarm(
        at: start,
        trigger: "5M",
        repeatRule: RepeatRule(frequency: .daily, interval: 1, timeZone: "Europe/Berlin", endCondition: .count(times: 3))
      )
      
      let result = plan(alarms: [alarm])
  
      XCTAssertEqual(result.count, 3)
      XCTAssertEqual(result[2].occurrenceNumber, 2)
    }
  
    func testWhenRepeatedAlarmStartsBeforeNowOnlyFutureOcurrencesArePlanned() {
      let start = dateProvider.now.advanced(by: -10, .minutes)
      let alarm = makeAlarm(
        at: start,
        trigger: "5M",
        repeatRule: RepeatRule(frequency: .daily, interval: 1, timeZone: "Europe/Berlin", endCondition: .count(times: 3))
      )
      
      let result = plan(alarms: [alarm])
  
      XCTAssertEqual(result.count, 2)
      XCTAssertEqual(result[1].occurrenceNumber, 2)
    }
  
  func testWhenMultipleAlarmsArePresentOnlyTheNewestOccurrencesArePlanned() {
    let repeatRule = RepeatRule(
      frequency: .daily,
      interval: 1,
      timeZone: "Europe/Berlin",
      endCondition: .never
    )
    
    let alarm1 = makeAlarm(
      at: dateProvider.now.advanced(by: 10, .minutes),
      trigger: "5M",
      repeatRule: repeatRule,
      identifier: "alarm1"
    )
    let alarm2 = makeAlarm(
      at: dateProvider.now.advanced(by: 20, .minutes),
      trigger: "5M",
      repeatRule: repeatRule,
      identifier: "alarm2"
    )
    let alarm3 = makeAlarm(
      at: dateProvider.now.advanced(by: 30, .minutes),
      trigger: "5M",
      repeatRule: repeatRule,
      identifier: "alarm3"
    )
    
    let result = plan(alarms: [alarm1, alarm2, alarm3])
    
    XCTAssertEqual(result.count, overallAlarmLimit)
    let identifiers = result.map { $0.alarm.identifier }
    let expectedIdentifiers = [
      "alarm1", "alarm2", "alarm3",
      "alarm1", "alarm2", "alarm3",
      "alarm1", "alarm2", "alarm3",
      "alarm1"
    ]
    XCTAssertEqual(identifiers, expectedIdentifiers)
  }
  
  private func plan(alarms: [AlarmNotification]) -> [AlarmOccurence] {
    return Array(alarmModel.plan(alarms: alarms))
  }
  
  func testIteratedRepeatAlarm() {
    let timeZone = "Europe/Berlin"
    let eventStart = date(2019, 6, 2, 12, timeZone)
    let eventEnd = date(2019, 6, 2, 12, timeZone)
    
    let repeatRule = RepeatRule(
      frequency: .weekly,
      interval: 1,
      timeZone: timeZone,
      endCondition: .never
    )
    
    let localTimeZone = TimeZone(identifier: timeZone)!
    let seq = alarmModel.futureOccurrencesOf(alarm: AlarmNotification(
      operation: .Create,
      summary: "summary",
      eventStart: eventStart,
 eventEnd: eventEnd,
      alarmInfo: AlarmInfo(alarmIdentifer: "id", trigger: "5M"),
      repeatRule: repeatRule,
      user: "user"
    ))
    let occurrences = Array(seq.prefix(4)).map { $0.eventOccurrenceTime }
    
    let expected = [
      date(2019, 6, 2, 12, timeZone),
      date(2019, 6, 9, 12, timeZone),
      date(2019, 6, 16, 12, timeZone),
      date(2019, 6, 23, 12, timeZone)
    ]
    XCTAssertEqual(occurrences, expected)
  }
  
  func testIteratesAlLDayeventWithEnd() {
    let timeZone = "Europe/Berlin"
    dateProvider.timeZone = TimeZone(identifier: "Europe/Berlin")!
    
    let repeatRuleTimeZone = "Asia/Anadyr"
    let eventStart = AlarmModel.allDayDateUTC(date: date(2019, 5, 1, 0, timeZone))
    let eventEnd = AlarmModel.allDayDateUTC(date: date(2019, 5, 2, 0, timeZone))
    let repeatEnd = AlarmModel.allDayDateUTC(date: date(2019, 5, 3, 0, timeZone))
    let repeatRule = RepeatRule(
      frequency: .daily,
      interval: 1,
      timeZone: repeatRuleTimeZone,
      endCondition: .untilDate(date: repeatEnd))
    
    let seq = alarmModel.futureOccurrencesOf(alarm: AlarmNotification(
      operation: .Create,
      summary: "summary",
      eventStart: eventStart,
      eventEnd: eventEnd,
      alarmInfo: AlarmInfo(alarmIdentifer: "id", trigger: "5M"),
      repeatRule: repeatRule,
      user: "user"
    ))
    
    // FIXME
    let occurrences = Array(
      (prefix(seq: seq, 4)as any Sequence)
    ).map { $0.eventOccurrenceTime }
    
    let expected = [
      date(2019, 5, 1, 0, timeZone),
      date(2019, 5, 2, 0, timeZone)
    ]
    XCTAssertEqual(occurrences, expected)
  }
  
  func prefix(seq: some Sequence<AlarmOccurence>, _ maxLength: Int) -> some Sequence<AlarmOccurence> {
    return seq.prefix(maxLength)
  }
  
  private func makeAlarm(
    at date: Date,
    trigger: String,
    repeatRule: RepeatRule? = nil,
    identifier: String = "identifier"
  ) -> AlarmNotification {
    return AlarmNotification(
      operation: .Create,
      summary: "summary",
      eventStart: date,
      eventEnd: date,
      alarmInfo: AlarmInfo(alarmIdentifer: identifier, trigger: trigger),
      repeatRule: repeatRule,
      user: "user"
    )
  }
}

private func date(_ year: Int, _ month: Int, _ dayOfMonth: Int, _ hour: Int, _ timeZoneName: String) -> Date {
  let calendar = Calendar.current
  let timeZone = TimeZone(identifier: timeZoneName)
  var components = DateComponents()
  components.year = year
  components.month = month
  components.day = dayOfMonth
  components.hour = hour
  components.timeZone = timeZone
  
  return calendar.date(from: components)!
}


// MARK: duration helpers

extension Date {
  func advanced(by amount: Double, _ unit: UnitDuration) -> Date {
    return self + Measurement(value: amount, unit: unit).converted(to: .seconds).value
  }
}
