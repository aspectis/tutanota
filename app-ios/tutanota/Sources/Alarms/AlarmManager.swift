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
  private let keychainManager: KeychainManager
  private let userPreference: UserPreferenceFacade
  
  init(keychainManager: KeychainManager, userPreference: UserPreferenceFacade) {
    self.keychainManager = keychainManager
    self.userPreference = userPreference
  }

  func processNewAlarms(_ alarms: Array<EncryptedAlarmNotification>) throws {
    var savedNotifications = self.userPreference.alarms
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
    self.userPreference.store(alarms: savedNotifications)
    if let error = resultError {
      throw error
    }
  }

  
  func resetStoredState() {
    TUTSLog("Resetting stored state")
    self.unscheduleAllAlarms(userId: nil)
    self.userPreference.clear()
    do {
      try keychainManager.removePushIdentifierKeys()
    } catch {
      TUTSLog("Faied to remove pushIdentifier keys \(error)")
    }
  }
  
  func rescheduleAlarms() {
    TUTSLog("Re-scheduling alarms")
    DispatchQueue.global(qos: .background).async {
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
  }
  
  private func savedAlarms() -> Set<EncryptedAlarmNotification> {
    let savedNotifications = self.userPreference.alarms
    let set = Set(savedNotifications)
    if set.count != savedNotifications.count {
      TUTSLog("Duplicated alarms detected, re-saving...")
      self.userPreference.store(alarms: Array(set))
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
    let alarms = self.userPreference.alarms
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
    let sessionKey = self.resolveSessionkey(alarmNotification: encAlarmNotification)
    guard let sessionKey = sessionKey else {
      throw TUTErrorFactory.createError("Cannot resolve session key")
    }
    let alarmNotification = try AlarmNotification(encrypted: encAlarmNotification, sessionKey: sessionKey)
    
    if let repeatRule = alarmNotification.repeatRule {
      return try self.iterateRepeatingAlarm(alarm: alarmNotification, repeatRule: repeatRule)
    } else {
      let singleOcurrence = OccurrenceInfo(occurrence: 0, occurrenceTime: alarmNotification.eventStart, alarm: alarmNotification)
      return [singleOcurrence]
    }
  }
  
  private func unscheduleAlarm(_ encAlarmNotification: EncryptedAlarmNotification) throws {
    let alarmIdentifier = encAlarmNotification.alarmInfo.alarmIdentifier
    let sessionKey = self.resolveSessionkey(alarmNotification: encAlarmNotification)
    guard let sessionKey = sessionKey else {
      throw TUTErrorFactory.createError("Cannot resolve session key on unschedule \(alarmIdentifier)")
    }
    let alarmNotification = try AlarmNotification(encrypted: encAlarmNotification, sessionKey: sessionKey)
    
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
  
  private func resolveSessionkey(alarmNotification: EncryptedAlarmNotification) -> Key? {
    var lastError: Error?
    for notificationSessionKey in alarmNotification.notificationSessionKeys {
      do {
        let pushIdentifierSessionKey = try self.keychainManager
          .getKey(keyId: notificationSessionKey.pushIdentifier.elementId)
        guard let pushIdentifierSessionKey = pushIdentifierSessionKey else {
          continue
        }
        let encSessionKey = Data(base64Encoded: notificationSessionKey.pushIdentifierSessionEncSessionKey)!
        return try TUTAes128Facade.decryptKey(encSessionKey, withEncryptionKey: pushIdentifierSessionKey)
      } catch {
        TUTSLog("Failed to decrypt key \(notificationSessionKey.pushIdentifier.elementId) \(error)")
        lastError = error
      }
    }
    TUTSLog("Failed to resolve session key \(alarmNotification.alarmInfo.alarmIdentifier), last error: \(String(describing: lastError))")
    return nil
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
    
    if alarmTime.timeIntervalSinceNow < 0 {
      TUTSLog("Alarm is in the past \(alarmIdentifier) \(alarmTime)")
      return
    }
    let fortNightSeconds: Double = 60 * 60 * 24 * 14
    if alarmTime.timeIntervalSinceNow > fortNightSeconds {
      TUTSLog("Event alarm is too far into the future \(alarmIdentifier) \(alarmTime)")
    }
    
    let formattedTime = DateFormatter.localizedString(
      from: occurrenceInfo.occurrenceTime,
      dateStyle: .short,
      timeStyle: .short
    )
    let notificationText = "\(formattedTime): \(summary)"
    let cal = Calendar.current
    let dateComponents = cal.dateComponents(
      [.year, .month, .day, .hour, .minute],
      from: alarmTime
    )
    let notificationTrigger = UNCalendarNotificationTrigger(
      dateMatching: dateComponents,
      repeats: false
    )
    let content = UNMutableNotificationContent()
    content.title = translate("TutaoCalendarAlarmTitle", default: "Reminder")
    content.body = notificationText
    content.sound = UNNotificationSound.default
    
    let identifier = ocurrenceIdentifier(
      alarmIdentifier: alarmIdentifier,
      occurrence: occurrenceInfo.occurrence
    )
    let request = UNNotificationRequest(
      identifier: identifier,
      content: content,
      trigger: notificationTrigger
    )
    TUTSLog("Scheduling a notification \(identifier) at \(cal.date(from: dateComponents)!)")
    UNUserNotificationCenter.current().add(request) { error in
      if let error = error {
        // We should make the whole funciton async and wait for it
        TUTSLog("Failed to schedule a notification \(error)")
      }
    }
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
