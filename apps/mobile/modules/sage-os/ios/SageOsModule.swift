import Contacts
import EventKit
import ExpoModulesCore
import Foundation

/**
 * iOS native OS bridge (Contacts / EventKit / FileManager). Each method
 * requests the relevant permission and throws a "permission_denied: <scope>"
 * error when access is refused — the JS layer maps that to a PERMISSION_DENIED
 * ToolResult. All operations are local and work offline. File access is sandboxed
 * to the app's Documents directory.
 */
public class SageOsModule: Module {
  private let contactStore = CNContactStore()
  private let eventStore = EKEventStore()

  public func definition() -> ModuleDefinition {
    Name("SageOs")

    AsyncFunction("contactsRead") { (query: String?, limit: Int) async throws -> [[String: Any]] in
      try await self.ensureContactsAccess()
      let keys = [CNContactGivenNameKey, CNContactFamilyNameKey, CNContactPhoneNumbersKey, CNContactEmailAddressesKey] as [CNKeyDescriptor]
      var out: [[String: Any]] = []
      let request = CNContactFetchRequest(keysToFetch: keys)
      try self.contactStore.enumerateContacts(with: request) { contact, stop in
        let name = "\(contact.givenName) \(contact.familyName)".trimmingCharacters(in: .whitespaces)
        if let q = query, !q.isEmpty, !name.lowercased().contains(q.lowercased()) { return }
        out.append([
          "name": name,
          "phones": contact.phoneNumbers.map { $0.value.stringValue },
          "emails": contact.emailAddresses.map { $0.value as String },
        ])
        if out.count >= limit { stop.pointee = true }
      }
      return out
    }

    AsyncFunction("calendarCreate") { (title: String, startISO: String, endISO: String, location: String?, notes: String?) async throws -> [String: String] in
      try await self.ensureEventAccess(forReminders: false)
      let event = EKEvent(eventStore: self.eventStore)
      event.title = title
      event.startDate = try Self.parseISO(startISO)
      event.endDate = try Self.parseISO(endISO)
      event.location = location
      event.notes = notes
      event.calendar = self.eventStore.defaultCalendarForNewEvents
      try self.eventStore.save(event, span: .thisEvent)
      return ["id": event.eventIdentifier]
    }

    AsyncFunction("calendarQuery") { (startISO: String, endISO: String) async throws -> [[String: String]] in
      try await self.ensureEventAccess(forReminders: false)
      let predicate = self.eventStore.predicateForEvents(
        withStart: try Self.parseISO(startISO), end: try Self.parseISO(endISO), calendars: nil)
      return self.eventStore.events(matching: predicate).map {
        [
          "id": $0.eventIdentifier,
          "title": $0.title ?? "",
          "startISO": Self.formatISO($0.startDate),
          "endISO": Self.formatISO($0.endDate),
        ]
      }
    }

    AsyncFunction("reminderCreate") { (title: String, dueISO: String?, notes: String?) async throws -> [String: String] in
      try await self.ensureEventAccess(forReminders: true)
      let reminder = EKReminder(eventStore: self.eventStore)
      reminder.title = title
      reminder.notes = notes
      reminder.calendar = self.eventStore.defaultCalendarForNewReminders()
      if let due = dueISO {
        reminder.dueDateComponents = Calendar.current.dateComponents(
          [.year, .month, .day, .hour, .minute], from: try Self.parseISO(due))
      }
      try self.eventStore.save(reminder, commit: true)
      return ["id": reminder.calendarItemIdentifier]
    }

    AsyncFunction("reminderList") { (includeCompleted: Bool, limit: Int) async throws -> [[String: Any]] in
      try await self.ensureEventAccess(forReminders: true)
      let predicate = self.eventStore.predicateForReminders(in: nil)
      let reminders: [EKReminder] = await withCheckedContinuation { cont in
        self.eventStore.fetchReminders(matching: predicate) { cont.resume(returning: $0 ?? []) }
      }
      return reminders
        .filter { includeCompleted || !$0.isCompleted }
        .prefix(limit)
        .map {
          [
            "id": $0.calendarItemIdentifier,
            "title": $0.title ?? "",
            "completed": $0.isCompleted,
            "dueISO": $0.dueDateComponents.flatMap { Calendar.current.date(from: $0) }.map(Self.formatISO) as Any,
          ]
        }
    }

    AsyncFunction("fileRead") { (path: String) throws -> [String: String] in
      let url = try Self.sandboxURL(path)
      return ["content": try String(contentsOf: url, encoding: .utf8)]
    }

    AsyncFunction("fileWrite") { (path: String, content: String) throws -> [String: Int] in
      let url = try Self.sandboxURL(path)
      try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try content.write(to: url, atomically: true, encoding: .utf8)
      return ["bytes": content.utf8.count]
    }

    AsyncFunction("fileList") { (path: String) throws -> [[String: Any]] in
      let dir = try Self.sandboxURL(path)
      let items = try FileManager.default.contentsOfDirectory(
        at: dir, includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey])
      return items.map {
        let values = try? $0.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey])
        return ["name": $0.lastPathComponent, "isDir": values?.isDirectory ?? false, "size": values?.fileSize ?? 0]
      }
    }
  }

  // MARK: - Permissions

  private func ensureContactsAccess() async throws {
    let granted: Bool = await withCheckedContinuation { cont in
      self.contactStore.requestAccess(for: .contacts) { ok, _ in cont.resume(returning: ok) }
    }
    if !granted { throw Self.denied("contacts") }
  }

  private func ensureEventAccess(forReminders: Bool) async throws {
    let granted: Bool = await withCheckedContinuation { cont in
      let handler: EKEventStoreRequestAccessCompletionHandler = { ok, _ in cont.resume(returning: ok) }
      if #available(iOS 17.0, *) {
        if forReminders { self.eventStore.requestFullAccessToReminders(completion: handler) }
        else { self.eventStore.requestFullAccessToEvents(completion: handler) }
      } else {
        self.eventStore.requestAccess(to: forReminders ? .reminder : .event, completion: handler)
      }
    }
    if !granted { throw Self.denied(forReminders ? "reminders" : "calendar") }
  }

  // MARK: - Helpers

  private static func denied(_ scope: String) -> NSError {
    NSError(domain: "SageOs", code: 1, userInfo: [NSLocalizedDescriptionKey: "permission_denied: \(scope)"])
  }

  /// Resolve a relative path inside the app's Documents directory (sandboxed).
  private static func sandboxURL(_ path: String) throws -> URL {
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let clean = path.replacingOccurrences(of: "..", with: "")
    return docs.appendingPathComponent(clean)
  }

  private static let iso: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
  }()
  private static func parseISO(_ s: String) throws -> Date {
    guard let d = iso.date(from: s) else { throw NSError(domain: "SageOs", code: 2, userInfo: [NSLocalizedDescriptionKey: "invalid_date: \(s)"]) }
    return d
  }
  private static func formatISO(_ d: Date) -> String { iso.string(from: d) }
}
