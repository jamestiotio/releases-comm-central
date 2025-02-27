/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailConsts } = ChromeUtils.import("resource:///modules/MailConsts.jsm");
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { getMsgStreamUrl } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionMessages.sys.mjs"
);
/**
 * Returns the currently displayed messages in the given tab.
 *
 * @param {Tab} tab
 * @returns {nsIMsgDBHdr[]} Array of nsIMsgDBHdr
 */
function getDisplayedMessages(tab) {
  const nativeTab = tab.nativeTab;
  if (tab instanceof TabmailTab) {
    if (nativeTab.mode.name == "mail3PaneTab") {
      return nativeTab.chromeBrowser.contentWindow.gDBView.getSelectedMsgHdrs();
    } else if (nativeTab.mode.name == "mailMessageTab") {
      return [nativeTab.chromeBrowser.contentWindow.gMessage];
    }
  } else if (nativeTab?.messageBrowser) {
    return [nativeTab.messageBrowser.contentWindow.gMessage];
  }
  return [];
}

/**
 * Wrapper to convert multiple nsIMsgDBHdr to MessageHeader objects.
 *
 * @param {nsIMsgDBHdr[]} Array of nsIMsgDBHdr
 * @param {ExtensionData} extension
 * @returns {MessageHeader[]} Array of MessageHeader objects
 *
 * @see /mail/components/extensions/schemas/messages.json
 */
function convertMessages(messages, extension) {
  const result = [];
  for (const msg of messages) {
    const hdr = extension.messageManager.convert(msg);
    if (hdr) {
      result.push(hdr);
    }
  }
  return result;
}

/**
 * Check the users preference on opening new messages in tabs or windows.
 *
 * @returns {string} - either "tab" or "window"
 */
function getDefaultMessageOpenLocation() {
  const pref = Services.prefs.getIntPref("mail.openMessageBehavior");
  return pref == MailConsts.OpenMessageBehavior.NEW_TAB ? "tab" : "window";
}

/**
 * Return the msgHdr of the message specified in the properties object. Message
 * can be specified via properties.headerMessageId or properties.messageId.
 *
 * @param {object} properties - @see mail/components/extensions/schemas/messageDisplay.json
 * @param {ExtensionData} extension
 * @throws ExtensionError if an unknown message has been specified
 * @returns {nsIMsgDBHdr} the requested msgHdr
 */
function getMsgHdr(properties, extension) {
  if (properties.headerMessageId) {
    const msgHdr = MailUtils.getMsgHdrForMsgId(properties.headerMessageId);
    if (!msgHdr) {
      throw new ExtensionError(
        `Unknown or invalid headerMessageId: ${properties.headerMessageId}.`
      );
    }
    return msgHdr;
  }
  const msgHdr = extension.messageManager.get(properties.messageId);
  if (!msgHdr) {
    throw new ExtensionError(
      `Unknown or invalid messageId: ${properties.messageId}.`
    );
  }
  return msgHdr;
}

this.messageDisplay = class extends ExtensionAPIPersistent {
  PERSISTENT_EVENTS = {
    // For primed persistent events (deactivated background), the context is only
    // available after fire.wakeup() has fulfilled (ensuring the convert() function
    // has been called).

    onMessageDisplayed({ context, fire }) {
      const { extension } = this;
      const { tabManager, messageManager } = extension;
      const listener = {
        async handleEvent(event) {
          if (fire.wakeup) {
            await fire.wakeup();
          }
          // `event.target` is an about:message window.
          const nativeTab = event.target.tabOrWindow;
          const tab = tabManager.wrapTab(nativeTab);
          const msg = messageManager.convert(event.detail);
          fire.async(tab.convert(), msg);
        },
      };
      windowTracker.addListener("MsgLoaded", listener);
      return {
        unregister: () => {
          windowTracker.removeListener("MsgLoaded", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onMessagesDisplayed({ context, fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      const listener = {
        async handleEvent(event) {
          if (fire.wakeup) {
            await fire.wakeup();
          }
          // `event.target` is an about:message or about:3pane window.
          const nativeTab = event.target.tabOrWindow;
          const tab = tabManager.wrapTab(nativeTab);
          const msgs = getDisplayedMessages(tab);
          fire.async(tab.convert(), convertMessages(msgs, extension));
        },
      };
      windowTracker.addListener("MsgsLoaded", listener);
      return {
        unregister: () => {
          windowTracker.removeListener("MsgsLoaded", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
  };

  getAPI(context) {
    /**
     * Guard to make sure the API waits until the message tab has been fully loaded,
     * to cope with tabs.onCreated returning tabs very early.
     *
     * @param {integer} tabId
     * @returns {Tab} the fully loaded message tab identified by the given tabId,
     *   or null, if invalid
     */
    async function getMessageDisplayTab(tabId) {
      let msgContentWindow;
      const tab = tabManager.get(tabId);
      if (tab?.type == "mail") {
        // In about:3pane only the messageBrowser needs to be checked for its
        // load state. The webBrowser is invalid, the multiMessageBrowser can
        // bypass.
        if (!tab.nativeTab.chromeBrowser.contentWindow.webBrowser.hidden) {
          return null;
        }
        if (
          !tab.nativeTab.chromeBrowser.contentWindow.multiMessageBrowser.hidden
        ) {
          return tab;
        }
        msgContentWindow =
          tab.nativeTab.chromeBrowser.contentWindow.messageBrowser
            .contentWindow;
      } else if (tab?.type == "messageDisplay") {
        msgContentWindow =
          tab instanceof TabmailTab
            ? tab.nativeTab.chromeBrowser.contentWindow
            : tab.nativeTab.messageBrowser.contentWindow;
      } else {
        return null;
      }

      // Make sure the content window has been fully loaded.
      await new Promise(resolve => {
        if (msgContentWindow.document.readyState == "complete") {
          resolve();
        } else {
          msgContentWindow.addEventListener(
            "load",
            () => {
              resolve();
            },
            { once: true }
          );
        }
      });

      // Wait until the message display process has been initiated.
      await new Promise(resolve => {
        if (msgContentWindow.msgLoading || msgContentWindow.msgLoaded) {
          resolve();
        } else {
          msgContentWindow.addEventListener(
            "messageURIChanged",
            () => {
              resolve();
            },
            { once: true }
          );
        }
      });

      // Wait until the message display process has been finished.
      await new Promise(resolve => {
        if (msgContentWindow.msgLoaded) {
          resolve();
        } else {
          msgContentWindow.addEventListener(
            "MsgLoaded",
            () => {
              resolve();
            },
            { once: true }
          );
        }
      });

      // If there is no gMessage, then the display has been cleared.
      return msgContentWindow.gMessage ? tab : null;
    }

    const { extension } = context;
    const { tabManager } = extension;
    return {
      messageDisplay: {
        onMessageDisplayed: new EventManager({
          context,
          module: "messageDisplay",
          event: "onMessageDisplayed",
          extensionApi: this,
        }).api(),
        onMessagesDisplayed: new EventManager({
          context,
          module: "messageDisplay",
          event: "onMessagesDisplayed",
          extensionApi: this,
        }).api(),
        async getDisplayedMessage(tabId) {
          const tab = await getMessageDisplayTab(tabId);
          if (!tab) {
            return null;
          }
          const messages = getDisplayedMessages(tab);
          if (messages.length != 1) {
            return null;
          }
          return extension.messageManager.convert(messages[0]);
        },
        async getDisplayedMessages(tabId) {
          const tab = await getMessageDisplayTab(tabId);
          if (!tab) {
            return [];
          }
          const messages = getDisplayedMessages(tab);
          return convertMessages(messages, extension);
        },
        async open(properties) {
          if (
            ["messageId", "headerMessageId", "file"].reduce(
              (count, value) => (properties[value] ? count + 1 : count),
              0
            ) != 1
          ) {
            throw new ExtensionError(
              "Exactly one of messageId, headerMessageId or file must be specified."
            );
          }

          let messageURI;
          if (properties.file) {
            const realFile = await getRealFileForFile(properties.file);
            messageURI = Services.io
              .newFileURI(realFile)
              .mutate()
              .setQuery("type=application/x-message-display")
              .finalize().spec;
          } else {
            const msgHdr = getMsgHdr(properties, extension);
            messageURI = getMsgStreamUrl(msgHdr);
          }

          let tab;
          switch (properties.location || getDefaultMessageOpenLocation()) {
            case "tab":
              {
                const normalWindow = await getNormalWindowReady(
                  context,
                  properties.windowId
                );
                const active = properties.active ?? true;
                const tabmail = normalWindow.document.getElementById("tabmail");
                const currentTab = tabmail.selectedTab;
                const nativeTabInfo = tabmail.openTab("mailMessageTab", {
                  messageURI,
                  background: !active,
                });
                await new Promise(resolve =>
                  nativeTabInfo.chromeBrowser.addEventListener(
                    "MsgLoaded",
                    resolve,
                    { once: true }
                  )
                );
                tab = tabManager.convert(nativeTabInfo, currentTab);
              }
              break;

            case "window":
              {
                // Handle window location.
                const topNormalWindow = await getNormalWindowReady();
                const messageWindow =
                  topNormalWindow.MsgOpenNewWindowForMessage(
                    Services.io.newURI(messageURI)
                  );
                await new Promise(resolve =>
                  messageWindow.addEventListener("MsgLoaded", resolve, {
                    once: true,
                  })
                );
                tab = tabManager.convert(messageWindow);
              }
              break;
          }
          return tab;
        },
      },
    };
  }
};
