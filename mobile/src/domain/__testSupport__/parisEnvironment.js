/**
 * A Jest test environment that runs a test file in the time zone
 * Europe/Paris. Jest gives each test file a copy of `process.env`, so a
 * change to `process.env.TZ` inside a test has no effect. This environment
 * runs outside the copy: it sets `TZ` on the real process of the worker and
 * restores the old value after the file.
 *
 * Use it with this docblock at the top of a test file:
 * `@jest-environment ./src/domain/__testSupport__/parisEnvironment.js`
 */
const { TestEnvironment } = require('jest-environment-node');

class ParisEnvironment extends TestEnvironment {
  async setup() {
    this.previousTz = process.env.TZ;
    process.env.TZ = 'Europe/Paris';
    await super.setup();
  }

  async teardown() {
    if (this.previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = this.previousTz;
    await super.teardown();
  }
}

module.exports = ParisEnvironment;
