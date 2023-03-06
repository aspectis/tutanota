import Foundation

protocol DateProvider {
  var now: Date { get }
}

class SystemDateProvieder : DateProvider {
  var now: Date {
    get {
      return Date()
    }
  }
}
