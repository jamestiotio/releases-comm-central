/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests accountcreation/readFromXML.js , reading the XML files
 * containing a mail configuration.
 *
 * To allow forwards-compatibility (add new stuff in the future without
 * breaking old clients on the new files), we are now fairly tolerant when
 * reading and allow fallback mechanisms. This test checks whether that works,
 * and of course also whether we can read a normal config and get the proper
 * values.
 */

// Globals

var { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);
var { readFromXML } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/readFromXML.sys.mjs"
);

var { JXON } = ChromeUtils.import("resource:///modules/JXON.jsm");

/*
 * UTILITIES
 */

function assert_equal(aA, aB, aWhy) {
  if (aA != aB) {
    do_throw(aWhy);
  }
  Assert.equal(aA, aB);
}

/**
 * Test that two config entries are the same.
 */
function assert_equal_config(aA, aB, field) {
  assert_equal(aA, aB, "Configured " + field + " is incorrect.");
}

/*
 * TESTS
 */

/**
 * Test that the xml reader returns a proper config and
 * is also forwards-compatible to new additions to the data format.
 */
function test_readFromXML_config1() {
  var clientConfigXML =
    "<clientConfig>" +
    '<emailProvider id="example.com">' +
    "<domain>example.com</domain>" +
    "<domain>example.net</domain>" +
    "<displayName>Example</displayName>" +
    "<displayShortName>Example Mail</displayShortName>" +
    // 1. - protocol not supported
    '<incomingServer type="imap5">' +
    "<hostname>badprotocol.example.com</hostname>" +
    "<port>993</port>" +
    "<socketType>SSL</socketType>" +
    "<username>%EMAILLOCALPART%</username>" +
    "<authentication>ssl-client-cert</authentication>" +
    "</incomingServer>" +
    // 2. - socket type not supported
    '<incomingServer type="imap">' +
    "<hostname>badsocket.example.com</hostname>" +
    "<port>993</port>" +
    "<socketType>key-from-DNSSEC</socketType>" +
    "<username>%EMAILLOCALPART%</username>" +
    "<authentication>password-cleartext</authentication>" +
    "</incomingServer>" +
    // 3. - first supported incoming server
    '<incomingServer type="imap">' +
    "<hostname>imapmail.example.com</hostname>" +
    "<port>993</port>" +
    "<socketType>SSL</socketType>" +
    "<username>%EMAILLOCALPART%</username>" +
    "<authentication>password-cleartext</authentication>" +
    "</incomingServer>" +
    // 4. - auth method not supported
    '<incomingServer type="imap">' +
    "<hostname>badauth.example.com</hostname>" +
    "<port>993</port>" +
    "<socketType>SSL</socketType>" +
    "<username>%EMAILLOCALPART%</username>" +
    "<authentication>ssl-client-cert</authentication>" +
    // Throw in some elements we don"t support yet
    "<imap>" +
    '<rootFolder path="INBOX."/>' +
    '<specialFolder id="sent" path="INBOX.Sent Mail"/>' +
    "</imap>" +
    "</incomingServer>" +
    // 5. - second supported incoming server
    '<incomingServer type="pop3">' +
    "<hostname>popmail.example.com</hostname>" +
    // alternative hostname, not yet supported, should be ignored
    "<hostname>popbackup.example.com</hostname>" +
    "<port>110</port>" +
    "<port>7878</port>" +
    // unsupported socket type
    "<socketType>GSSAPI2</socketType>" +
    // but fall back
    "<socketType>plain</socketType>" +
    "<username>%EMAILLOCALPART%</username>" +
    "<username>%EMAILADDRESS%</username>" +
    // unsupported auth method
    "<authentication>GSSAPI2</authentication>" +
    // but fall back
    "<authentication>password-encrypted</authentication>" +
    "<pop3>" +
    "<leaveMessagesOnServer>true</leaveMessagesOnServer>" +
    "<daysToLeaveMessagesOnServer>999</daysToLeaveMessagesOnServer>" +
    "</pop3>" +
    "</incomingServer>" +
    // outgoing server with invalid auth method
    '<outgoingServer type="smtp">' +
    "<hostname>badauth.example.com</hostname>" +
    "<port>587</port>" +
    "<socketType>STARTTLS</socketType>" +
    "<username>%EMAILADDRESS%</username>" +
    "<authentication>smtp-after-imap</authentication>" +
    "</outgoingServer>" +
    // outgoing server - supported
    '<outgoingServer type="smtp">' +
    "<hostname>smtpout.example.com</hostname>" +
    "<hostname>smtpfallback.example.com</hostname>" +
    "<port>587</port>" +
    "<port>7878</port>" +
    "<socketType>GSSAPI2</socketType>" +
    "<socketType>STARTTLS</socketType>" +
    "<username>%EMAILADDRESS%</username>" +
    "<username>%EMAILLOCALPART%</username>" +
    "<authentication>GSSAPI2</authentication>" +
    "<authentication>client-IP-address</authentication>" +
    "<smtp/>" +
    "</outgoingServer>" +
    // Throw in some more elements we don"t support yet
    '<enableURL url="http://foobar"/>' +
    '<instructionsURL url="http://foobar"/>' +
    "</emailProvider>" +
    "</clientConfig>";

  var domParser = new DOMParser();
  var config = readFromXML(
    JXON.build(domParser.parseFromString(clientConfigXML, "text/xml"))
  );

  Assert.equal(config instanceof AccountConfig, true);
  Assert.equal("example.com", config.id);
  Assert.equal("Example", config.displayName);
  Assert.notEqual(-1, config.domains.indexOf("example.com"));
  // 1. incoming server skipped because of an unsupported protocol
  // 2. incoming server skipped because of an so-far unknown auth method
  // 3. incoming server is fine for us: IMAP, SSL, cleartext password
  let server = config.incoming;
  Assert.equal("imapmail.example.com", server.hostname);
  Assert.equal("imap", server.type);
  Assert.equal(Ci.nsMsgSocketType.SSL, server.socketType);
  Assert.equal(3, server.auth); // cleartext password
  // only one more supported incoming server
  Assert.equal(1, config.incomingAlternatives.length);
  // 4. incoming server skipped because of an so-far unknown socketType
  // 5. server: POP
  server = config.incomingAlternatives[0];
  Assert.equal("popmail.example.com", server.hostname);
  Assert.equal("pop3", server.type);
  Assert.equal(Ci.nsMsgSocketType.plain, server.socketType);
  Assert.equal(4, server.auth); // encrypted password

  // SMTP server, most preferred
  server = config.outgoing;
  Assert.equal("smtpout.example.com", server.hostname);
  Assert.equal("smtp", server.type);
  Assert.equal(Ci.nsMsgSocketType.alwaysSTARTTLS, server.socketType);
  Assert.equal(1, server.auth); // no auth
  // no other SMTP servers
  Assert.equal(0, config.outgoingAlternatives.length);
}

/**
 * Test the replaceVariables method.
 */
function test_replaceVariables() {
  var clientConfigXML =
    "<clientConfig>" +
    '<emailProvider id="example.com">' +
    "<domain>example.com</domain>" +
    "<displayName>example.com</displayName>" +
    "<displayShortName>example.com</displayShortName>" +
    '<incomingServer type="pop3">' +
    "<hostname>pop.%EMAILDOMAIN%</hostname>" +
    "<port>995</port>" +
    "<socketType>SSL</socketType>" +
    "<username>%EMAILLOCALPART%</username>" +
    "<authentication>plain</authentication>" +
    "<pop3>" +
    "<leaveMessagesOnServer>true</leaveMessagesOnServer>" +
    "<daysToLeaveMessagesOnServer>999</daysToLeaveMessagesOnServer>" +
    "</pop3>" +
    "</incomingServer>" +
    '<outgoingServer type="smtp">' +
    "<hostname>smtp.example.com</hostname>" +
    "<port>587</port>" +
    "<socketType>STARTTLS</socketType>" +
    "<username>%EMAILADDRESS%</username>" +
    "<authentication>plain</authentication>" +
    "<addThisServer>true</addThisServer>" +
    "<useGlobalPreferredServer>false</useGlobalPreferredServer>" +
    "</outgoingServer>" +
    "</emailProvider>" +
    "</clientConfig>";

  var domParser = new DOMParser();
  var config = readFromXML(
    JXON.build(domParser.parseFromString(clientConfigXML, "text/xml"))
  );

  AccountConfig.replaceVariables(
    config,
    "Yamato Nadeshiko",
    "yamato.nadeshiko@example.com",
    "abc12345"
  );

  assert_equal_config(
    config.incoming.username,
    "yamato.nadeshiko",
    "incoming server username"
  );
  assert_equal_config(
    config.outgoing.username,
    "yamato.nadeshiko@example.com",
    "outgoing server username"
  );
  assert_equal_config(
    config.incoming.hostname,
    "pop.example.com",
    "incoming server hostname"
  );
  assert_equal_config(
    config.outgoing.hostname,
    "smtp.example.com",
    "outgoing server hostname"
  );
  assert_equal_config(
    config.identity.realname,
    "Yamato Nadeshiko",
    "user real name"
  );
  assert_equal_config(
    config.identity.emailAddress,
    "yamato.nadeshiko@example.com",
    "user email address"
  );
}

function run_test() {
  test_readFromXML_config1();
  test_replaceVariables();
}
