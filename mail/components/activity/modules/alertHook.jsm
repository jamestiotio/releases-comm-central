/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["alertHook"];

var nsActWarning = Components.Constructor(
  "@mozilla.org/activity-warning;1",
  "nsIActivityWarning",
  "init"
);

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

// This module provides a link between the send later service and the activity
// manager.
var alertHook = {
  get activityMgr() {
    delete this.activityMgr;
    return (this.activityMgr = Cc["@mozilla.org/activity-manager;1"].getService(
      Ci.nsIActivityManager
    ));
  },

  get alertService() {
    delete this.alertService;
    return (this.alertService = Cc["@mozilla.org/alerts-service;1"].getService(
      Ci.nsIAlertsService
    ));
  },

  get brandShortName() {
    delete this.brandShortName;
    return (this.brandShortName = Services.strings
      .createBundle("chrome://branding/locale/brand.properties")
      .GetStringFromName("brandShortName"));
  },

  QueryInterface: ChromeUtils.generateQI(["nsIMsgUserFeedbackListener"]),

  onAlert(aMessage, aUrl) {
    // Create a new warning.
    const warning = new nsActWarning(aMessage, this.activityMgr, "");

    if (aUrl && aUrl.server && aUrl.server.prettyName) {
      warning.groupingStyle = Ci.nsIActivity.GROUPING_STYLE_BYCONTEXT;
      warning.contextType = "incomingServer";
      warning.contextDisplayText = aUrl.server.prettyName;
      warning.contextObj = aUrl.server;
    } else {
      warning.groupingStyle = Ci.nsIActivity.GROUPING_STYLE_STANDALONE;
    }

    this.activityMgr.addActivity(warning);

    // If we have a message window in the url, then show a warning prompt,
    // just like the modal code used to. Otherwise, don't.
    try {
      if (!aUrl || !aUrl.msgWindow) {
        return true;
      }
    } catch (ex) {
      // nsIMsgMailNewsUrl.msgWindow will throw on a null pointer, so that's
      // what we're handling here.
      if (
        ex instanceof Ci.nsIException &&
        ex.result == Cr.NS_ERROR_INVALID_POINTER
      ) {
        return true;
      }
      throw ex;
    }

    try {
      const alert = Cc["@mozilla.org/alert-notification;1"].createInstance(
        Ci.nsIAlertNotification
      );
      alert.init(
        "", // name
        "chrome://branding/content/icon48.png",
        this.brandShortName,
        aMessage
      );
      this.alertService.showAlert(alert);
    } catch (ex) {
      // XXX On Linux, if libnotify isn't supported, showAlert
      // can throw an error, so fall-back to the old method of modal dialogs.
      return false;
    }

    return true;
  },

  init() {
    // We shouldn't need to remove the listener as we're not being held by
    // anyone except by the send later instance.
    MailServices.mailSession.addUserFeedbackListener(this);
  },
};
