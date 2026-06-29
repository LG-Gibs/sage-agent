import ExpoModulesCore
import Metal
import UIKit

/**
 * iOS implementation of the SAGE Capability Manifest probe.
 *
 * Platform paradigm (iOS): GPU acceleration via Metal, hardware ML via Core ML
 * / the Apple Neural Engine. Pairs with the Android (Vulkan / NNAPI) module.
 */
public class SageCapabilityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SageCapability")

    Function("getPlatform") { () -> String in
      "ios"
    }

    Function("getOsVersion") { () -> String in
      UIDevice.current.systemVersion
    }

    // Returned as Double because JS numbers are IEEE-754; RAM fits exactly.
    Function("getTotalRamBytes") { () -> Double in
      Double(ProcessInfo.processInfo.physicalMemory)
    }

    Function("getGpuBackend") { () -> String in
      // llama.cpp uses the Metal backend when a default Metal device exists.
      MTLCreateSystemDefaultDevice() != nil ? "metal" : "none"
    }

    Function("getMlAccelerator") { () -> String in
      // Core ML (and the Apple Neural Engine) ship on every supported device.
      "coreml"
    }

    Function("hasNpu") { () -> Bool in
      // The Apple Neural Engine is present on A11 Bionic and later — i.e. every
      // device that can run iOS 15.1+. Reported true for the deployment target.
      true
    }

    Function("getThermalState") { () -> String in
      switch ProcessInfo.processInfo.thermalState {
      case .critical: return "critical"
      case .serious: return "serious"
      case .fair: return "fair"
      case .nominal: return "nominal"
      @unknown default: return "nominal"
      }
    }

    AsyncFunction("listInstalledModels") { () -> [[String: Any]] in
      SageCapabilityModule.discoverModels()
    }
  }

  private static func discoverModels() -> [[String: Any]] {
    var out: [[String: Any]] = []
    let fm = FileManager.default
    guard
      let docs = fm.urls(for: .documentDirectory, in: .userDomainMask).first
    else { return out }
    let modelsDir = docs.appendingPathComponent("models", isDirectory: true)

    let candidates: [(file: String, id: String)] = [
      ("gemma-4-2b-q4.gguf", "gemma-4-2b"),
      ("gemma-4-9b-q4.gguf", "gemma-4-9b"),
    ]
    for c in candidates {
      let url = modelsDir.appendingPathComponent(c.file)
      guard fm.fileExists(atPath: url.path) else { continue }
      let attrs = try? fm.attributesOfItem(atPath: url.path)
      let size = (attrs?[.size] as? NSNumber)?.intValue ?? 0
      out.append([
        "id": c.id,
        "path": url.path,
        "sizeBytes": size,
        "verified": SageCapabilityModule.verifyGGUF(url: url),
      ])
    }
    return out
  }

  /// A real GGUF file begins with the ASCII magic "GGUF" (0x47 0x47 0x55 0x46).
  private static func verifyGGUF(url: URL) -> Bool {
    guard let handle = try? FileHandle(forReadingFrom: url) else { return false }
    defer { try? handle.close() }
    let magic = try? handle.read(upToCount: 4)
    return magic == Data([0x47, 0x47, 0x55, 0x46])
  }
}
