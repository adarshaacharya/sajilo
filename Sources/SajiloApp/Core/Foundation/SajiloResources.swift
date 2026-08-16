import Foundation

extension Bundle {
    /// Sajilo's generated SwiftPM resource bundle in both development and a
    /// conventionally packaged macOS app.
    ///
    /// SwiftPM's generated `Bundle.module` accessor only checks beside the app
    /// bundle, which would place resources outside `Contents` and make the app
    /// impossible to seal for Developer ID distribution. Public and local app
    /// bundles instead embed resources under `Contents/Resources`; tests and a
    /// bare `swift run` retain the generated accessor as their fallback.
    static nonisolated let sajiloResources: Bundle = {
        let bundleName = "Sajilo_SajiloApp.bundle"

        if let resourceURL = Bundle.main.resourceURL,
           let bundled = Bundle(url: resourceURL.appendingPathComponent(bundleName)) {
            return bundled
        }

        let adjacentURL = Bundle.main.bundleURL.appendingPathComponent(bundleName)
        if let adjacent = Bundle(url: adjacentURL) {
            return adjacent
        }

        #if SWIFT_PACKAGE
        return .module
        #else
        fatalError("Unable to locate \(bundleName)")
        #endif
    }()
}
