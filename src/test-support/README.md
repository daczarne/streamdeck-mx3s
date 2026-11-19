# test-support

The fakes and helpers the tests share, which the plugin never imports: emulated Bolt receivers and the devices paired with them, the `node-hid` they plug into, a fake Stream Deck and Deck to drive the actions through, a fake logger, a temporary folder for the scripts' tests to run a script in, and `at`, which reads an array element and fails the test when it's missing. [The testing guide][testing] describes each one, and how the tests use them.

[testing]: ../../docs/developer_guide/testing.md
