// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "Sajilo",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "Sajilo", targets: ["SajiloApp"])
    ],
    targets: [
        .executableTarget(
            name: "SajiloApp",
            path: "Sources/SajiloApp",
            resources: [.copy("Resources/CalendarEvents")]
        ),
        .testTarget(
            name: "SajiloAppTests",
            dependencies: ["SajiloApp"],
            path: "Tests/SajiloAppTests"
        )
    ]
)
