/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that the IMIP bar behaves properly for eml files with invites.
 */

var { open_message_from_file } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { close_window } = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

function getFileFromChromeURL(leafName) {
  let ChromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIChromeRegistry);

  let url = Services.io.newURI(getRootDirectory(gTestPath) + leafName);
  info(url.spec);
  let fileURL = ChromeRegistry.convertChromeURL(url).QueryInterface(Ci.nsIFileURL);
  return fileURL.file;
}

/**
 * Test that when opening a message containing a Teams meeting invite
 * works as it should.
 */
add_task(async function test_event_from_eml() {
  let file = getFileFromChromeURL("data/teams-meeting-invite.eml");

  let msgc = await open_message_from_file(file);

  await TestUtils.waitForCondition(
    () => !msgc.window.document.getElementById("imip-bar").collapsed
  );
  info("Ok, iMIP bar is showing");

  let links = [
    ...msgc.window.document.getElementById("messagepane").contentDocument.querySelectorAll("a"),
  ];

  Assert.equal(links.length, 3, "The 3 links should show");

  // Check the links and their text
  Assert.equal(
    links[0].href,
    "https://teams.microsoft.com/l/meetup-join/19%3ameeting_MGU5NmI2ZGYtOWZmOC00Y2ZmLWJlOTItNjUxNjA5YjUyYTYy%40thread.v2/0?context=%7b%22Tid%22%3a%222fd0c1c5-28e1-40c4-9f0d-a0363ca80a3c%22%2c%22Oid%22%3a%2214464d09-ceb8-458c-a61c-717f1e5c66c5%22%7d",
    "link0 href"
  );
  Assert.equal(
    links[0].textContent,
    "<https://teams.microsoft.com/l/meetup-join/19%3ameeting_MGU5NmI2ZGYtOWZmOC00Y2ZmLWJlOTItNjUxNjA5YjUyYTYy%40thread.v2/0?context=%7b%22Tid%22%3a%222fd0c1c5-28e1-40c4-9f0d-a0363ca80a3c%22%2c%22Oid%22%3a%2214464d09-ceb8-458c-a61c-717f1e5c66c5%22%7d>",
    "link0 textContent"
  );

  Assert.equal(links[1].href, "https://aka.ms/JoinTeamsMeeting", "link1 href");
  Assert.equal(links[1].textContent, "<https://aka.ms/JoinTeamsMeeting>", "link1 textContent");

  Assert.equal(
    links[2].href,
    "https://teams.microsoft.com/meetingOptions/?organizerId=14464d09-ceb8-458c-a61c-717f1e5c66c5&tenantId=2fd0c1c5-28e1-40c4-9f0d-a0363ca80a3c&threadId=19_meeting_MGU5NmI2ZGYtOWZmOC00Y2ZmLWJlOTItNjUxNjA5YjUyYTYy@thread.v2&messageId=0&language=fi-FI",
    "link2 href"
  );
  Assert.equal(
    links[2].textContent,
    "<https://teams.microsoft.com/meetingOptions/?organizerId=14464d09-ceb8-458c-a61c-717f1e5c66c5&tenantId=2fd0c1c5-28e1-40c4-9f0d-a0363ca80a3c&threadId=19_meeting_MGU5NmI2ZGYtOWZmOC00Y2ZmLWJlOTItNjUxNjA5YjUyYTYy@thread.v2&messageId=0&language=fi-FI>",
    "link2 textContent"
  );

  close_window(msgc);

  Assert.ok(true, "Test ran to completion");
});

/**
 * Test that when opening a message containing a Meet meeting invite
 * works as it should.
 */
add_task(async function test_event_from_eml() {
  let file = getFileFromChromeURL("data/meet-meeting-invite.eml");

  let msgc = await open_message_from_file(file);

  await TestUtils.waitForCondition(
    () => !msgc.window.document.getElementById("imip-bar").collapsed
  );
  info("Ok, iMIP bar is showing");

  let links = [
    ...msgc.window.document.getElementById("messagepane").contentDocument.querySelectorAll("a"),
  ];

  Assert.equal(links.length, 4, "The 4 links should show");

  // Check the links and their text
  Assert.equal(links[0].href, "mailto:foo@example.com", "link0 href");
  Assert.equal(links[0].textContent, "<foo@example.com>", "link0 textContent");

  Assert.equal(links[1].href, "http://example.com/?foo=bar", "link1 href");
  Assert.equal(links[1].textContent, "http://example.com?foo=bar", "link1 textContent");

  Assert.equal(links[2].href, "https://meet.google.com/pyb-ndcu-hhc", "link1 href");
  Assert.equal(links[2].textContent, "https://meet.google.com/pyb-ndcu-hhc", "link1 textContent");

  Assert.equal(
    links[3].href,
    "https://calendar.google.com/calendar/event?action=VIEW&eid=NjVtMTdoc2RvbG1vdHYza3ZtcnRnNDBvbnQgbWFnbnVzLm1lbGluQGh1dC5maQ&tok=MjEjYmVydGF0aGVib3RAZ21haWwuY29tZTg2NGFjYmNjYWE1MjVlZWJmY2UzYmRmMDAyNWU0MDkzNDAxZjRhZg&ctz=Europe%2FHelsinki&hl=sv&es=1",
    "link2 href"
  );
  Assert.equal(
    links[3].textContent,
    "https://calendar.google.com/calendar/event?action=VIEW&eid=NjVtMTdoc2RvbG1vdHYza3ZtcnRnNDBvbnQgbWFnbnVzLm1lbGluQGh1dC5maQ&tok=MjEjYmVydGF0aGVib3RAZ21haWwuY29tZTg2NGFjYmNjYWE1MjVlZWJmY2UzYmRmMDAyNWU0MDkzNDAxZjRhZg&ctz=Europe%2FHelsinki&hl=sv&es=1",
    "link2 textContent"
  );

  close_window(msgc);

  Assert.ok(true, "Test ran to completion");
});

/**
 * Test that when opening a message containing an event, the IMIP bar shows.
 */
add_task(async function test_event_from_eml() {
  let file = getFileFromChromeURL("data/message-containing-event.eml");

  let msgc = await open_message_from_file(file);

  await TestUtils.waitForCondition(
    () => !msgc.window.document.getElementById("imip-bar").collapsed
  );
  info("Ok, iMIP bar is showing");

  close_window(msgc);

  Assert.ok(true, "Test ran to completion");
});
