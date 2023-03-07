import Foundation
import XCTest
@testable import tutanota

// FIXME: rewrite me to actually test things

class AlarmManagerTest : XCTestCase {
  var persistor: AlarmPersistorStub!
  var cryptor: AlarmCryptorStub!
  var scheduler: AlarmSchedulerStub!
  var alarmManager: AlarmManager!
  
  override func setUp() {
    persistor = AlarmPersistorStub()
    cryptor = AlarmCryptorStub()
    scheduler = AlarmSchedulerStub()
//    alarmManager = AlarmManager(
//      alarmPersistor: persistor,
//      alarmCryptor: cryptor,
//      alarmScheduler: scheduler,
//      alarmModel: ??
//    )
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
  
  private func add(alarm: AlarmNotification) {
    let encryptedAlarm = EncryptedAlarmNotification(
      operation: alarm.operation,
      summary: alarm.summary,
      eventStart: "",
      eventEnd: "",
      alarmInfo: EncryptedAlarmInfo(alarmIdentifier: alarm.identifier, trigger: ""),
      repeatRule: nil,
      notificationSessionKeys: [],
      user: alarm.user
    )
    persistor.add(alarm: encryptedAlarm)
    cryptor.alarms[alarm.identifier] = alarm
  }
}

// MARK: stubs

class AlarmPersistorStub : AlarmPersistor {
  var alarms: [EncryptedAlarmNotification] = []
  
  func add(alarm: EncryptedAlarmNotification) {
    self.alarms.append(alarm)
  }
  
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
  // Mon Mar 06 2023 16:52:24 GMT+0100 (Central European Standard Time)
  var now: Date = Date(timeIntervalSince1970: 1678117944)
  
  var timeZone: TimeZone = TimeZone(identifier: "Europe/Berlin")!
}
