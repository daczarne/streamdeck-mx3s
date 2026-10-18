# Security

Please report a vulnerability privately, through [GitHub's private vulnerability reporting][report], rather than in a public issue. Say what an attacker could do, and how to reproduce it. Reports are answered as soon as possible, and a fix goes into a new release.

Only the latest release gets fixes.

The plugin runs on your computer, inside Stream Deck. It talks to the mouse over HID, and to Stream Deck over its WebSocket on `localhost`. It asks for no macOS permission on behalf of the Stream Deck app. A report that any of this can be bypassed, or about the code the plugin ships from its dependencies, is in scope.

[report]: https://github.com/daczarne/streamdeck-mx3s/security/advisories/new
