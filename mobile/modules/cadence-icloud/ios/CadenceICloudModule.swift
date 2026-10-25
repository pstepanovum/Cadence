import ExpoModulesCore
import Foundation

// The learner's recordings in their own iCloud Drive, in a Cadence folder
// they can see in the Files app. Only works in a build that carries the
// iCloud Documents entitlement (plugins/with-icloud-recordings.js); without
// it the container is nil and every call says so, and the app keeps the
// recordings on the phone alone. Copies are one way, phone to iCloud: the
// phone's own copy stays the source the app plays.
public class CadenceICloudModule: Module {
  private func folder() -> URL? {
    guard let root = FileManager.default.url(forUbiquityContainerIdentifier: nil) else { return nil }
    let url = root.appendingPathComponent("Documents", isDirectory: true).appendingPathComponent("Recordings", isDirectory: true)
    try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  private static func safeName(_ name: String) -> Bool {
    return !name.isEmpty && name.count <= 140 && !name.contains("/") && !name.hasPrefix(".")
  }

  public func definition() -> ModuleDefinition {
    Name("CadenceICloud")

    /// Signed in to iCloud on this device (the container may still be missing from the build).
    Function("isSignedIn") { () -> Bool in
      return FileManager.default.ubiquityIdentityToken != nil
    }

    /// The Recordings folder in the app's iCloud container, or nil when this build or device has none.
    AsyncFunction("containerPath") { () -> String? in
      return self.folder()?.path
    }

    /// Copies a local file (a file:// URI or a path) into the container under `name`, replacing any copy.
    AsyncFunction("copyIn") { (source: String, name: String) -> Bool in
      guard Self.safeName(name), let folder = self.folder() else { return false }
      let from = source.hasPrefix("file://") ? URL(string: source) : URL(fileURLWithPath: source)
      guard let from else { return false }
      let to = folder.appendingPathComponent(name)
      let manager = FileManager.default
      if manager.fileExists(atPath: to.path) { try? manager.removeItem(at: to) }
      do {
        try manager.copyItem(at: from, to: to)
        return true
      } catch {
        return false
      }
    }

    /// Removes one copy from the container.
    AsyncFunction("remove") { (name: String) -> Bool in
      guard Self.safeName(name), let folder = self.folder() else { return false }
      let url = folder.appendingPathComponent(name)
      guard FileManager.default.fileExists(atPath: url.path) else { return true }
      return (try? FileManager.default.removeItem(at: url)) != nil
    }

    /// The file names in the container's Recordings folder.
    AsyncFunction("list") { () -> [String] in
      guard let folder = self.folder() else { return [] }
      return (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []
    }
  }
}
