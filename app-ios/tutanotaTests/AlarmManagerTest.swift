import Foundation
import XCTest
@testable import tutanota

class AlarmManagerTest : XCTestCase {
  var persistor: AlarmPersistorStub!
  var cryptor: AlarmCryptorStub!
  var scheduler: AlarmSchedulerStub!
  var dateProvider: DateProvider!
  var alarmManager: AlarmManager!
  
  override func setUp() {
    persistor = AlarmPersistorStub()
    cryptor = AlarmCryptorStub()
    scheduler = AlarmSchedulerStub()
    dateProvider = DateProviderStub()
    alarmManager = AlarmManager(alarmPersistor: persistor, alarmCryptor: cryptor, alarmScheduler: scheduler, dateProvider: dateProvider)
  }
  
  func testWhenItHasOnealarmItSchedulesIt() {
    let start = dateProvider.now + Measurement(value: 10, unit: UnitDuration.minutes).converted(to: .seconds).value
    let alarm = AlarmNotification(
      operation: .Create,
      summary: "summary",
      eventStart: start,
      eventEnd: start,
      alarmInfo: AlarmInfo(alarmIdentifer: "identifier", trigger: "5M"),
      repeatRule: nil,
      user: "user"
    )
    let encryptedAlarm = EncryptedAlarmNotification(
      operation: alarm.operation,
      summary: alarm.summary,
      eventStart: "",
      eventEnd: "",
      alarmInfo: EncryptedAlarmInfo(alarmIdentifier: alarm.alarmInfo.alarmIdentifer, trigger: ""),
      repeatRule: nil,
      notificationSessionKeys: [],
      user: alarm.user
    )
    persistor.store(alarms: [encryptedAlarm])
    cryptor.alarms[alarm.alarmInfo.alarmIdentifer] = alarm
    
    alarmManager.rescheduleAlarms()
    
    // FIXME alarm time
    let expectedScheduleInfo = ScheduledAlarmInfo(alarmTime: start, occurrence: 0, identifier: "idk", summary: alarm.summary, eventDate: start)
    XCTAssertEqual(scheduler.scheduled, [expectedScheduleInfo])
    
  }
}

class AlarmPersistorStub : AlarmPersistor {
  var alarms: [EncryptedAlarmNotification] = []
  
  func store(alarms: [EncryptedAlarmNotification]) {
    self.alarms = alarms
  }
  
  func clear() {
    self.alarms = []
  }
}

class AlarmCryptorStub : AlarmCryptor {
  var alarms: [String : AlarmNotification] = [:]
  
  func decrypt(alarm: EncryptedAlarmNotification) throws -> AlarmNotification {
    if let alarm = self.alarms[alarm.alarmInfo.alarmIdentifier] {
      return alarm
    } else {
      throw TutanotaError(message: "Failed to 'decrypt' alarm \(alarm.alarmInfo.alarmIdentifier)")
    }
  }
}

class AlarmSchedulerStub : AlarmScheduler {
  var scheduled: [ScheduledAlarmInfo] = []
  
  func schedule(info: ScheduledAlarmInfo) {
    self.scheduled.append(info)
  }
}

class DateProviderStub : DateProvider {
  var now: Date = Date(timeIntervalSince1970: 1678117944)
}
