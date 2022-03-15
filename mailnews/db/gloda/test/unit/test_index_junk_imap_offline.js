/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test indexing support for offline IMAP junk.
 */

var { glodaTestHelperInitialize } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaTestHelper.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

glodaTestHelperInitialize({
  mode: "imap",
  offline: true,
});

/* import-globals-from base_index_junk.js */
load("base_index_junk.js");

add_task(function setupTest() {
  // Set these preferences to stop the cache value "cachePDir" being fetched. This
  // avoids errors on the javascript console, for which the test would otherwise fail.
  // See bug 903402 for follow-up information.
  Services.prefs.setComplexValue(
    "browser.cache.disk.parent_directory",
    Ci.nsIFile,
    do_get_profile()
  );
  Services.prefs.setComplexValue(
    "browser.cache.offline.parent_directory",
    Ci.nsIFile,
    do_get_profile()
  );
});

base_index_junk_tests.forEach(e => {
  add_task(e);
});
