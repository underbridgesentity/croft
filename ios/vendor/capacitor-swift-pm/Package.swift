// swift-tools-version:5.3

// VENDORED copy of github.com/ionic-team/capacitor-swift-pm @ 8.4.1.
//
// Xcode Cloud runners lost outbound network access in custom build phases
// (builds 23-27: nodejs.org, registry.npmjs.org, github.com all unreachable),
// so the remote package + its release-asset binaryTargets can't be fetched
// there. The xcframework zips are committed alongside this manifest; their
// contents are byte-identical to the 8.4.1 release assets (checksums verified:
// Capacitor 04665ab2..., Cordova 76172be2...).
//
// ci_post_clone.sh rewrites the app's package manifests to point HERE during
// CI builds only - local development keeps using the remote package.
// When upgrading @capacitor/ios, re-download the matching release zips and
// update this comment's checksums.

import PackageDescription

let package = Package(
    name: "capacitor-swift-pm",
    products: [
        .library(
            name: "Capacitor",
            targets: ["Capacitor"]
        ),
        .library(
            name: "Cordova",
            targets: ["Cordova"]
        )
    ],
    dependencies: [],
    targets: [
        .binaryTarget(
            name: "Capacitor",
            path: "Capacitor.xcframework.zip"
        ),
        .binaryTarget(
            name: "Cordova",
            path: "Cordova.xcframework.zip"
        )
    ]
)
