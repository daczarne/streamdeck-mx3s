# Contributing

- [Changes go through pull requests](#changes-go-through-pull-requests)
- [Small pull requests](#small-pull-requests)
- [Commit messages and pull request text](#commit-messages-and-pull-request-text)
- [Features ship with tests](#features-ship-with-tests)
- [Dependencies](#dependencies)
- [Unused code](#unused-code)
- [Supported mice](#supported-mice)
- [Working with Claude](#working-with-claude)

This document describes how work on this repository is done: how changes reach `main`, how they are sliced and recorded, what each one has to bring with it, and the design rules that hold across the plugin. Style is covered separately, in [the style guide][style-guide].

## Changes go through pull requests

Nothing is pushed to `main`. Every change, however small, is made on its own branch and reaches `main` through a pull request, which is squash-merged. Pushing to the repository and merging are the maintainer's. `.github/CODEOWNERS` makes the maintainer the owner of every file, so a pull request from anyone else needs the maintainer's approval before it can be merged.

Branch names are flat kebab-case, without `/`: `change-host-action`, not `feature/change-host-action`.

## Small pull requests

Each pull request is small and focused on one thing, because large ones are hard to review. An issue doesn't have to be closed by a single pull request: it can take several, and work that grows beyond it becomes its own issue.

When work turns up that doesn't belong in the current branch, it becomes an issue instead of being added to the branch.

## Commit messages and pull request text

Since pull requests are squash-merged, their title and description become the commit on `main`. They are the history of the repository, so that's where the care goes: they are written for someone reading that history later, and an inaccuracy is fixed there.

Commit messages on a branch disappear in the squash. They stay short and accurate, but they aren't polished or rewritten after the fact.

## Features ship with tests

Every new feature or enhancement comes with automated tests for it, in the same pull request. Otherwise the branch that adds the feature can also add its bugs, typically in edge cases nobody tested. The first feature that needs tests brings the test setup with it. The issue isn't done until the tests are in.

- A unit test covers one module, with the modules it builds on faked, or the mouse emulated for the code that talks to it: its logic and its edge cases, such as invalid settings, logs and each kind of failure. An integration test covers what crosses modules: that what one module reports or sends reaches the next as that one expects.
- What can't be automated, such as Stream Deck's own behavior or what the mouse does, is checked by hand on the Deck. Those checks are written down in `docs/manual_testing/`, one document per area, with when to run them and what each one should show, so that anyone can repeat them without remembering how. A feature that needs new manual checks adds them there, in the same pull request.
- A bug the tests find, which the branch doesn't fix, gets a test stating the intended behavior, marked as failing and linked to its own issue. When the bug is fixed, the test starts passing, and it becomes a normal test.

## Dependencies

Every dependency is pinned, and every upgrade is a deliberate change of its own.

- `package.json` declares exact versions only, never ranges. The project `.npmrc` sets `save-exact=true`, so `npm install <package>` records an exact version, and `ignore-scripts=true`, so no install runs install scripts.
- An upgrade is `npm install <package>@<version>`, followed by a review of the lockfile diff. Exact versions don't pin transitive dependencies, only the lockfile does, so it stays committed and installs use `npm ci`.
- A dependency installed from GitHub is pinned to a full commit SHA instead of a version.
- No remote code runs inside Stream Deck. A library the settings pages load is vendored into the plugin folder, with its hash recorded, rather than loaded from a CDN.
- GitHub Actions are pinned to full commit SHAs, with the version as a trailing comment, checked against the release tag. Like npm packages, they're upgraded by hand.

## Unused code

Code or configuration that is unused, misleading or contradicts a decision already made is removed. For example, an entry relying on install scripts, now that `.npmrc` sets `ignore-scripts=true`, would contradict that decision even if it did nothing.

## Supported mice

The MX Master 3S, connected directly over Bluetooth, is the plugin's target: it's what the plugin is checked on, and the tests, the fakes and the defaults use its real values. Other connections, such as a Logi Bolt receiver, and other mice are added one at a time, and one is called supported once it has been checked on the hardware.

## Working with Claude

- When asked for a command, Claude replies with the command and doesn't run it. Steps that change what the Deck runs or shows, like restarting the plugin, and steps that move the mouse to another host, are the user's to run, while looking at the hardware.

[style-guide]: style_guide.md
