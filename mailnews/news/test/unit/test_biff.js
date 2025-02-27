// This tests that we can execute biff properly, specifically that filters are
// run during biff, producing correct counts.

/* import-globals-from ../../../test/resources/filterTestUtils.js */
load("../../../resources/filterTestUtils.js");

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

function run_test() {
  // Set up the server and add in filters
  const daemon = setupNNTPDaemon();
  const server = makeServer(NNTP_RFC2980_handler, daemon);
  server.start();
  const localserver = setupLocalServer(server.port);
  // Remove all but the test.filter folder
  const rootFolder = localserver.rootFolder;
  for (const folder of rootFolder.subFolders) {
    if (folder.name != "test.filter") {
      rootFolder.propagateDelete(folder, true);
    }
  }

  // Create a filter to mark one message read.
  const filters = localserver.getFilterList(null);
  filters.loggingEnabled = true;
  createFilter(filters, "subject", "Odd", "read");
  localserver.setFilterList(filters);

  // This is a bit hackish, but we don't have any really functional callbacks
  // for biff. Instead, we use the notifier to look for all 7 messages to be
  // added and take that as our sign that the download is finished.
  const expectCount = 7;
  let seen = 0;
  const listener = {
    msgAdded() {
      if (++seen == expectCount) {
        localserver.closeCachedConnections();
      }
    },
  };
  MailServices.mfn.addListener(
    listener,
    Ci.nsIMsgFolderNotificationService.msgAdded
  );
  localserver.performBiff(null);
  server.performTest();
  MailServices.mfn.removeListener(listener);

  // We marked, via our filters, one of the messages read. So if we do not
  // have 1 read message, either we're not running the filters on biff, or the
  // filters aren't working. This is disambiguated by the test_filter.js test.
  const folder = localserver.rootFolder.getChildNamed("test.filter");
  Assert.equal(folder.getTotalMessages(false), folder.getNumUnread(false) + 1);
  server.stop();
}
