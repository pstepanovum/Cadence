import CryptoKit
import DeviceCheck
import ExpoModulesCore

// App Attest for Firebase App Check's REST exchange. Firebase hashes the raw
// challenge bytes (and, for an assertion, the artifact followed by the
// challenge), so the client data arrives here as base64 parts that are decoded,
// joined and hashed with SHA-256 before Apple signs them.
public class CadenceAppAttestModule: Module {
  private let service = DCAppAttestService.shared

  public func definition() -> ModuleDefinition {
    Name("CadenceAppAttest")

    Constant("isSupported") {
      return service.isSupported
    }

    AsyncFunction("generateKey") { () async throws -> String in
      return try await service.generateKey()
    }

    AsyncFunction("attestKey") { (keyId: String, parts: [String]) async throws -> String in
      let hash = try Self.hash(parts)
      let attestation = try await service.attestKey(keyId, clientDataHash: hash)
      return attestation.base64EncodedString()
    }

    AsyncFunction("generateAssertion") { (keyId: String, parts: [String]) async throws -> String in
      let hash = try Self.hash(parts)
      let assertion = try await service.generateAssertion(keyId, clientDataHash: hash)
      return assertion.base64EncodedString()
    }
  }

  private static func hash(_ parts: [String]) throws -> Data {
    var data = Data()
    for part in parts {
      guard let bytes = Data(base64Encoded: part) else {
        throw Exception(name: "InvalidInput", description: "Client data must be base64.")
      }
      data.append(bytes)
    }
    return Data(SHA256.hash(data: data))
  }
}
