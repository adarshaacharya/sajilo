// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "Sajilo",
    defaultLocalization: "en",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "Sajilo", targets: ["SajiloApp"])
    ],
    targets: [
        .executableTarget(
            name: "SajiloApp",
            path: "Sources/SajiloApp",
            resources: [
                .copy("Resources/CalendarEvents"),
                .process("Resources/en.lproj"),
                .process("Resources/ne.lproj")
            ]
        ),
        .testTarget(
            name: "SajiloAppTests",
            dependencies: ["SajiloApp"],
            path: "Tests/SajiloAppTests"
        )
    ]
)
