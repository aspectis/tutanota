import Foundation

// iOS (13.3 at least) has a limit on saved alarms which empirically inferred to be.
// It means that only *last* 64 alarms are stored in the internal plist by SpringBoard.
// If we schedule too many some alarms will not be fired. We should be careful to not
// schedule too far into the future.
//
// Better approach would be to calculate occurences from all alarms, sort them and take
// the first 64. Or schedule later ones first so that newer ones have higher priority.
private let EVENTS_SCHEDULED_AHEAD = 14
private let SYSTEM_ALARM_LIMIT = 64

enum HttpStatusCode: Int {
  case ok = 200
  case notAuthenticated = 401
  case notFound = 404
  case tooManyRequests = 429
  case serviceUnavailable = 503
}

class AlarmManager {
  private let alarmPersistor: AlarmPersistor
  private let alarmCryptor: AlarmCryptor
  private let alarmScheduler: AlarmScheduler
  private let dateProvider: DateProvider
  
  init(
    alarmPersistor: AlarmPersistor,
    alarmCryptor: AlarmCryptor,
    alarmScheduler: AlarmScheduler,
    dateProvider: DateProvider
  ) {
    self.alarmPersistor = alarmPersistor
    self.alarmCryptor = alarmCryptor
    self.alarmScheduler = alarmScheduler
    self.dateProvider = dateProvider
  }

  func processNewAlarms(_ alarms: Array<EncryptedAlarmNotification>) throws {
    var savedNotifications = self.alarmPersistor.alarms
    var resultError: Error?
    for alarmNotification in alarms {
      do {
        try self.handleAlarmNotification(alarmNotification, existingAlarms: &savedNotifications)
      } catch {
        TUTSLog("Error while handling alarm \(error)")
        resultError = error
      }
    }
    
    TUTSLog("Finished processing \(alarms.count) alarms")
    self.alarmPersistor.store(alarms: savedNotifications)
    if let error = resultError {
      throw error
    }
  }

  func resetStoredState() {
    TUTSLog("Resetting stored state")
    self.unscheduleAllAlarms(userId: nil)
    self.alarmPersistor.clear()
  }
  
  func rescheduleAlarms() {
    TUTSLog("Re-scheduling alarms")
    var occurrences = [OccurrenceInfo]()
    for notification in self.savedAlarms() {
      do {
        occurrences += try self.calculateOccurrencesOf(alarm: notification)
      } catch {
        TUTSLog("Error when re-scheduling alarm \(notification) \(error)")
      }
    }
    occurrences.sort(by: { $0.occurrenceTime < $1.occurrenceTime })
    
    for occurrence in occurrences.prefix(SYSTEM_ALARM_LIMIT).reversed() {
      self.scheduleAlarmOccurrence(
        occurrenceInfo: occurrence,
        trigger: occurrence.alarm.alarmInfo.trigger,
        summary: occurrence.alarm.summary,
        alarmIdentifier: occurrence.alarm.alarmInfo.alarmIdentifer
      )
    }
  }
  
  private func savedAlarms() -> Set<EncryptedAlarmNotification> {
    let savedNotifications = self.alarmPersistor.alarms
    let set = Set(savedNotifications)
    if set.count != savedNotifications.count {
      TUTSLog("Duplicated alarms detected, re-saving...")
      self.alarmPersistor.store(alarms: Array(set))
    }
    return set
  }
  
  private func handleAlarmNotification(
    _ alarm: EncryptedAlarmNotification,
    existingAlarms: inout Array<EncryptedAlarmNotification>
  ) throws {
    switch alarm.operation {
    case .Create:
      if !existingAlarms.contains(alarm) {
        existingAlarms.append(alarm)
      }
      // FIXME reschedule afterwards
    case .Delete:
      let alarmToUnschedule = existingAlarms.first { $0 == alarm } ?? alarm
      do {
        try self.unscheduleAlarm(alarmToUnschedule)
      } catch {
        TUTSLog("Failed to cancel alarm \(alarm) \(error)")
        throw error
      }
      if let index = existingAlarms.firstIndex(of: alarmToUnschedule) {
        existingAlarms.remove(at: index)
      }
    default:
      fatalError("Unexpected operation for alarm: \(alarm.operation)")
    }
  }
  
  func unscheduleAllAlarms(userId: String?) {
    let alarms = self.alarmPersistor.alarms
    for alarm in alarms {
      if userId != nil && userId != alarm.user {
        continue
      }
      do {
        try self.unscheduleAlarm(alarm)
      } catch {
        TUTSLog("Error while unscheduling of all alarms \(error)")
      }
    }
  }
  
  private func calculateOccurrencesOf(alarm encAlarmNotification: EncryptedAlarmNotification) throws -> [OccurrenceInfo] {
    let alarmNotification = try alarmCryptor.decrypt(alarm: encAlarmNotification)
    
    if let repeatRule = alarmNotification.repeatRule {
      return try self.iterateRepeatingAlarm(alarm: alarmNotification, repeatRule: repeatRule)
    } else {
      let singleOcurrence = OccurrenceInfo(occurrence: 0, occurrenceTime: alarmNotification.eventStart, alarm: alarmNotification)
      return [singleOcurrence]
    }
  }
  
  private func unscheduleAlarm(_ encAlarmNotification: EncryptedAlarmNotification) throws {
    let alarmIdentifier = encAlarmNotification.alarmInfo.alarmIdentifier
    let alarmNotification = try alarmCryptor.decrypt(alarm: encAlarmNotification)
    
    let occurrenceIds: [String]
    if let repeatRule = alarmNotification.repeatRule {
      let ocurrences = try self.iterateRepeatingAlarm(
        alarm: alarmNotification,
        repeatRule: repeatRule
      )
      occurrenceIds = ocurrences.map { o in
        ocurrenceIdentifier(alarmIdentifier: alarmIdentifier, occurrence: o.occurrence)
      }
    } else {
      occurrenceIds = [ocurrenceIdentifier(alarmIdentifier: alarmIdentifier, occurrence: 0)]
    }
    TUTSLog("Cancelling alarm \(alarmIdentifier)")
    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: occurrenceIds)
  }
  
  private func iterateRepeatingAlarm(
    alarm: AlarmNotification,
    repeatRule: RepeatRule
  ) throws -> [OccurrenceInfo] {
    let now = Date()
    let occurencesAfterNow = AlarmModel.iterateRepeatingAlarm(
      eventStart: alarm.eventStart,
      eventEnd: alarm.eventEnd,
      repeatRule: repeatRule,
      localTimeZone: TimeZone.current
    )
      .lazy
      .filter { $0.occurenceDate > now }

    return occurencesAfterNow
      .prefix(EVENTS_SCHEDULED_AHEAD)
      .map { occurrence in
        return OccurrenceInfo(occurrence: occurrence.occurrenceNumber, occurrenceTime: occurrence.occurenceDate, alarm: alarm)
      }
  }
  
  private func scheduleAlarmOccurrence(
    occurrenceInfo: OccurrenceInfo,
    trigger: String,
    summary: String,
    alarmIdentifier: String
  ) {
    let alarmTime = AlarmModel.alarmTime(trigger: trigger, eventTime: occurrenceInfo.occurrenceTime)
    
    if alarmTime.timeIntervalSince(dateProvider.now) < 0 {
      TUTSLog("Alarm is in the past \(alarmIdentifier) \(alarmTime)")
      return
    }
    let fortNightSeconds: Double = 60 * 60 * 24 * 14
    if alarmTime.timeIntervalSince(dateProvider.now) > fortNightSeconds {
      TUTSLog("Event alarm is too far into the future \(alarmIdentifier) \(alarmTime)")
      return
    }
    
    
    let identifier = ocurrenceIdentifier(
      alarmIdentifier: alarmIdentifier,
      occurrence: occurrenceInfo.occurrence
    )
    
    let info = ScheduledAlarmInfo(alarmTime: alarmTime, occurrence: occurrenceInfo.occurrence, identifier: identifier, summary: summary, eventDate: occurrenceInfo.occurrenceTime)
    
    self.alarmScheduler.schedule(info: info)
  }
}

fileprivate struct OccurrenceInfo {
  let occurrence: Int
  let occurrenceTime: Date
  let alarm: AlarmNotification
}

fileprivate func ocurrenceIdentifier(alarmIdentifier: String, occurrence: Int) -> String {
  return "\(alarmIdentifier)#\(occurrence)"
}
