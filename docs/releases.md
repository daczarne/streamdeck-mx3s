# Releases

- [When to release](#when-to-release)
- [The version](#the-version)
- [Making a release](#making-a-release)
  - [1. A branch that raises the version](#1-a-branch-that-raises-the-version)
  - [2. The merge drafts the release](#2-the-merge-drafts-the-release)
  - [3. Publishing](#3-publishing)
  - [4. Checking the release](#4-checking-the-release)

This document describes how a release of the plugin is made, from the branch that raises its version to the published release, and why each step is there. How the package is built, and what it holds, is in the Packaging section of [the README][packaging].

## When to release

There's no schedule. A release is made when what has been merged since the last one is worth installing, and it's made by a pull request that raises the version: nothing else starts one. The plugin isn't on Elgato's Marketplace, so a release is a file on GitHub, which users download and open. Only the latest release gets fixes (see [`SECURITY.md`][security]): a fix ships in a new release, never in an old one.

## The version

The version is the `Version` in `com.daczarne.mx3s.sdPlugin/manifest.json`. The bug report template shows the latest release's as an example, so it's written there too (see [the branch that raises it](#1-a-branch-that-raises-the-version)). Elgato's format has four numbers, `{major}.{minor}.{patch}.{build}`, and the last one stays 0. The release's tag, and the version users see, is the first three, as `v{major}.{minor}.{patch}`.

Releases follow [semantic versioning][semver], where a breaking change is one that breaks keys already set up, such as a renamed action or a setting whose meaning changes. Before 1.0, a release that adds or changes what the plugin does raises the minor, breaking changes included, and one that only fixes something raises the patch.

## Making a release

### 1. A branch that raises the version

The version is written in two files, which the branch raises together:

- `Version` in `manifest.json`, the version itself, which CI reads.
- The placeholder of the plugin version field, in `.github/ISSUE_TEMPLATE/bug_report.yaml`, so a reporter sees the latest release as an example of what to fill in.

The branch also checks `.github/release-notes.md`, which is the same for every release, against what the release changes:

- What the plugin needs, Stream Deck 7.1 or later on macOS 12 or later or Windows 10 or later, matches the minimum versions of `Software` and `OS` in `manifest.json`.
- What it says is supported and checked, such as the mouse, its connection and the systems, is still true.

The branch can be the one that brings the release's last change, or one of its own, which only raises the version.

### 2. The merge drafts the release

Once the branch is merged, CI's last job runs on the push to `main`, after every check has passed. When the manifest's version has no release yet, drafts included, it:

1. Packs the plugin with `npm run pack`, as the Packaging section of [the README][packaging] describes.
2. Records the package's provenance in an attestation, which ties it to the commit and the workflow that built it.
3. Drafts a release tagged `v{major}.{minor}.{patch}`, which holds the package and the notes from `.github/release-notes.md`, with the version and the package's SHA-256 filled in, followed by the pull requests merged since the last release, which GitHub lists.

A merge that doesn't raise the version finds its release already made, and drafts nothing.

### 3. Publishing

Publishing the draft is manual, once its notes are read: the pull requests GitHub lists are the release's changes, and their titles should read as such. Publishing creates the tag, on the commit the draft points to.

### 4. Checking the release

Development runs linked from the repository, where the plugin also finds the repository's `node_modules`, so a file missing from the package only shows once the plugin is installed. Each release is therefore installed from its page once it's published, on macOS and on Windows, and checked there as its users run it, following [the release checks][release-checks]. What the checks find broken is fixed through a pull request, and ships in a patch release.

[packaging]: ../README.md#packaging
[release-checks]: manual_testing/releases.md
[security]: ../SECURITY.md
[semver]: https://semver.org
