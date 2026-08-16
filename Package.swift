// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "Sajilo",
    defaultLocalization: "en",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "Sajilo", targets: ["SajiloApp"])
    ],
    dependencies: [
        .package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.9.5")
    ],
    targets: [
        .executableTarget(
            name: "SajiloApp",
            dependencies: [
                .product(name: "Sparkle", package: "Sparkle")
            ],
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
