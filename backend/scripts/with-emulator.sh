#!/bin/sh
# Starts the local Firestore and Auth emulators with the demo project
# `demo-gauges`, runs the command in $1 (or waits, if there is no command),
# and stops the emulators. A demo project ID ("demo-...") never connects to
# a live project. The emulator loads `firestore.rules` (see firebase.json).
set -e
cd "$(dirname "$0")/.."

# The emulator needs Java 21 or newer. If the active java (from $JAVA_HOME or
# from PATH) is older, use the Homebrew OpenJDK 21 when it exists.
java_major() {
  "$1" -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -n 1
}
if [ -n "$JAVA_HOME" ]; then java_bin="$JAVA_HOME/bin/java"; else java_bin=java; fi
major=$(java_major "$java_bin" || true)
if [ -z "$major" ] || [ "$major" -lt 21 ]; then
  for dir in /opt/homebrew/opt/openjdk@21 /usr/local/opt/openjdk@21; do
    if [ -x "$dir/bin/java" ]; then
      export JAVA_HOME="$dir"
      export PATH="$dir/bin:$PATH"
      break
    fi
  done
fi

# Never let a credentials file from the shell reach the emulator or the tests.
unset GOOGLE_APPLICATION_CREDENTIALS
export GCLOUD_PROJECT=demo-gauges
if [ -n "$1" ]; then
  exec npx firebase emulators:exec --only firestore,auth --project demo-gauges "$1"
else
  exec npx firebase emulators:start --only firestore,auth --project demo-gauges
fi
