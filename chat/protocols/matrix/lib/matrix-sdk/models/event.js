"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "EventStatus", {
  enumerable: true,
  get: function () {
    return _eventStatus.EventStatus;
  }
});
exports.MatrixEventEvent = exports.MatrixEvent = void 0;
var _matrixEventsSdk = require("matrix-events-sdk");
var _logger = require("../logger");
var _event = require("../@types/event");
var _utils = require("../utils");
var _thread = require("./thread");
var _ReEmitter = require("../ReEmitter");
var _typedEventEmitter = require("./typed-event-emitter");
var _algorithms = require("../crypto/algorithms");
var _OlmDevice = require("../crypto/OlmDevice");
var _eventStatus = require("./event-status");
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /*
                                                                                                                                                                                                                                                                                                                                                                                          Copyright 2015 - 2023 The Matrix.org Foundation C.I.C.
                                                                                                                                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                                                                                                          Licensed under the Apache License, Version 2.0 (the "License");
                                                                                                                                                                                                                                                                                                                                                                                          you may not use this file except in compliance with the License.
                                                                                                                                                                                                                                                                                                                                                                                          You may obtain a copy of the License at
                                                                                                                                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                                                                                                              http://www.apache.org/licenses/LICENSE-2.0
                                                                                                                                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                                                                                                          Unless required by applicable law or agreed to in writing, software
                                                                                                                                                                                                                                                                                                                                                                                          distributed under the License is distributed on an "AS IS" BASIS,
                                                                                                                                                                                                                                                                                                                                                                                          WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
                                                                                                                                                                                                                                                                                                                                                                                          See the License for the specific language governing permissions and
                                                                                                                                                                                                                                                                                                                                                                                          limitations under the License.
                                                                                                                                                                                                                                                                                                                                                                                          */ /**
                                                                                                                                                                                                                                                                                                                                                                                              * This is an internal module. See {@link MatrixEvent} and {@link RoomEvent} for
                                                                                                                                                                                                                                                                                                                                                                                              * the public classes.
                                                                                                                                                                                                                                                                                                                                                                                              */
/* eslint-disable camelcase */

/**
 * When an event is a visibility change event, as per MSC3531,
 * the visibility change implied by the event.
 */

/* eslint-enable camelcase */

/**
 * Message hiding, as specified by https://github.com/matrix-org/matrix-doc/pull/3531.
 */

/**
 * Variant of `MessageVisibility` for the case in which the message should be displayed.
 */

/**
 * Variant of `MessageVisibility` for the case in which the message should be hidden.
 */

// A singleton implementing `IMessageVisibilityVisible`.
const MESSAGE_VISIBLE = Object.freeze({
  visible: true
});
let MatrixEventEvent = /*#__PURE__*/function (MatrixEventEvent) {
  MatrixEventEvent["Decrypted"] = "Event.decrypted";
  MatrixEventEvent["BeforeRedaction"] = "Event.beforeRedaction";
  MatrixEventEvent["VisibilityChange"] = "Event.visibilityChange";
  MatrixEventEvent["LocalEventIdReplaced"] = "Event.localEventIdReplaced";
  MatrixEventEvent["Status"] = "Event.status";
  MatrixEventEvent["Replaced"] = "Event.replaced";
  MatrixEventEvent["RelationsCreated"] = "Event.relationsCreated";
  return MatrixEventEvent;
}({});
exports.MatrixEventEvent = MatrixEventEvent;
class MatrixEvent extends _typedEventEmitter.TypedEventEmitter {
  /**
   * Construct a Matrix Event object
   *
   * @param event - The raw (possibly encrypted) event. <b>Do not access
   * this property</b> directly unless you absolutely have to. Prefer the getter
   * methods defined on this class. Using the getter methods shields your app
   * from changes to event JSON between Matrix versions.
   */
  constructor(event = {}) {
    super();

    // intern the values of matrix events to force share strings and reduce the
    // amount of needless string duplication. This can save moderate amounts of
    // memory (~10% on a 350MB heap).
    // 'membership' at the event level (rather than the content level) is a legacy
    // field that Element never otherwise looks at, but it will still take up a lot
    // of space if we don't intern it.
    this.event = event;
    // applied push rule and action for this event
    _defineProperty(this, "pushDetails", {});
    _defineProperty(this, "_replacingEvent", null);
    _defineProperty(this, "_localRedactionEvent", null);
    _defineProperty(this, "_isCancelled", false);
    _defineProperty(this, "clearEvent", void 0);
    /* Message hiding, as specified by https://github.com/matrix-org/matrix-doc/pull/3531.
     Note: We're returning this object, so any value stored here MUST be frozen.
    */
    _defineProperty(this, "visibility", MESSAGE_VISIBLE);
    // Not all events will be extensible-event compatible, so cache a flag in
    // addition to a falsy cached event value. We check the flag later on in
    // a public getter to decide if the cache is valid.
    _defineProperty(this, "_hasCachedExtEv", false);
    _defineProperty(this, "_cachedExtEv", undefined);
    /* curve25519 key which we believe belongs to the sender of the event. See
     * getSenderKey()
     */
    _defineProperty(this, "senderCurve25519Key", null);
    /* ed25519 key which the sender of this event (for olm) or the creator of
     * the megolm session (for megolm) claims to own. See getClaimedEd25519Key()
     */
    _defineProperty(this, "claimedEd25519Key", null);
    /* curve25519 keys of devices involved in telling us about the
     * senderCurve25519Key and claimedEd25519Key.
     * See getForwardingCurve25519KeyChain().
     */
    _defineProperty(this, "forwardingCurve25519KeyChain", []);
    /* where the decryption key is untrusted
     */
    _defineProperty(this, "untrusted", null);
    /* if we have a process decrypting this event, a Promise which resolves
     * when it is finished. Normally null.
     */
    _defineProperty(this, "decryptionPromise", null);
    /* flag to indicate if we should retry decrypting this event after the
     * first attempt (eg, we have received new data which means that a second
     * attempt may succeed)
     */
    _defineProperty(this, "retryDecryption", false);
    /* The txnId with which this event was sent if it was during this session,
     * allows for a unique ID which does not change when the event comes back down sync.
     */
    _defineProperty(this, "txnId", void 0);
    /**
     * A reference to the thread this event belongs to
     */
    _defineProperty(this, "thread", void 0);
    _defineProperty(this, "threadId", void 0);
    /*
     * True if this event is an encrypted event which we failed to decrypt, the receiver's device is unverified and
     * the sender has disabled encrypting to unverified devices.
     */
    _defineProperty(this, "encryptedDisabledForUnverifiedDevices", false);
    /* Set an approximate timestamp for the event relative the local clock.
     * This will inherently be approximate because it doesn't take into account
     * the time between the server putting the 'age' field on the event as it sent
     * it to us and the time we're now constructing this event, but that's better
     * than assuming the local clock is in sync with the origin HS's clock.
     */
    _defineProperty(this, "localTimestamp", void 0);
    /**
     * The room member who sent this event, or null e.g.
     * this is a presence event. This is only guaranteed to be set for events that
     * appear in a timeline, ie. do not guarantee that it will be set on state
     * events.
     * @privateRemarks
     * Should be read-only
     */
    _defineProperty(this, "sender", null);
    /**
     * The room member who is the target of this event, e.g.
     * the invitee, the person being banned, etc.
     * @privateRemarks
     * Should be read-only
     */
    _defineProperty(this, "target", null);
    /**
     * The sending status of the event.
     * @privateRemarks
     * Should be read-only
     */
    _defineProperty(this, "status", null);
    /**
     * most recent error associated with sending the event, if any
     * @privateRemarks
     * Should be read-only
     */
    _defineProperty(this, "error", null);
    /**
     * True if this event is 'forward looking', meaning
     * that getDirectionalContent() will return event.content and not event.prev_content.
     * Only state events may be backwards looking
     * Default: true. <strong>This property is experimental and may change.</strong>
     * @privateRemarks
     * Should be read-only
     */
    _defineProperty(this, "forwardLooking", true);
    /* If the event is a `m.key.verification.request` (or to_device `m.key.verification.start`) event,
     * `Crypto` will set this the `VerificationRequest` for the event
     * so it can be easily accessed from the timeline.
     */
    _defineProperty(this, "verificationRequest", void 0);
    _defineProperty(this, "reEmitter", void 0);
    ["state_key", "type", "sender", "room_id", "membership"].forEach(prop => {
      if (typeof event[prop] !== "string") return;
      event[prop] = (0, _utils.internaliseString)(event[prop]);
    });
    ["membership", "avatar_url", "displayname"].forEach(prop => {
      if (typeof event.content?.[prop] !== "string") return;
      event.content[prop] = (0, _utils.internaliseString)(event.content[prop]);
    });
    ["rel_type"].forEach(prop => {
      if (typeof event.content?.["m.relates_to"]?.[prop] !== "string") return;
      event.content["m.relates_to"][prop] = (0, _utils.internaliseString)(event.content["m.relates_to"][prop]);
    });
    this.txnId = event.txn_id;
    this.localTimestamp = Date.now() - (this.getAge() ?? 0);
    this.reEmitter = new _ReEmitter.TypedReEmitter(this);
  }

  /**
   * Unstable getter to try and get an extensible event. Note that this might
   * return a falsy value if the event could not be parsed as an extensible
   * event.
   *
   * @deprecated Use stable functions where possible.
   */
  get unstableExtensibleEvent() {
    if (!this._hasCachedExtEv) {
      this._cachedExtEv = _matrixEventsSdk.ExtensibleEvents.parse(this.getEffectiveEvent());
    }
    return this._cachedExtEv;
  }
  invalidateExtensibleEvent() {
    // just reset the flag - that'll trick the getter into parsing a new event
    this._hasCachedExtEv = false;
  }

  /**
   * Gets the event as though it would appear unencrypted. If the event is already not
   * encrypted, it is simply returned as-is.
   * @returns The event in wire format.
   */
  getEffectiveEvent() {
    const content = Object.assign({}, this.getContent()); // clone for mutation

    if (this.getWireType() === _event.EventType.RoomMessageEncrypted) {
      // Encrypted events sometimes aren't symmetrical on the `content` so we'll copy
      // that over too, but only for missing properties. We don't copy over mismatches
      // between the plain and decrypted copies of `content` because we assume that the
      // app is relying on the decrypted version, so we want to expose that as a source
      // of truth here too.
      for (const [key, value] of Object.entries(this.getWireContent())) {
        // Skip fields from the encrypted event schema though - we don't want to leak
        // these.
        if (["algorithm", "ciphertext", "device_id", "sender_key", "session_id"].includes(key)) {
          continue;
        }
        if (content[key] === undefined) content[key] = value;
      }
    }

    // clearEvent doesn't have all the fields, so we'll copy what we can from this.event.
    // We also copy over our "fixed" content key.
    return Object.assign({}, this.event, this.clearEvent, {
      content
    });
  }

  /**
   * Get the event_id for this event.
   * @returns The event ID, e.g. <code>$143350589368169JsLZx:localhost
   * </code>
   */
  getId() {
    return this.event.event_id;
  }

  /**
   * Get the user_id for this event.
   * @returns The user ID, e.g. `@alice:matrix.org`
   */
  getSender() {
    return this.event.sender || this.event.user_id; // v2 / v1
  }

  /**
   * Get the (decrypted, if necessary) type of event.
   *
   * @returns The event type, e.g. `m.room.message`
   */
  getType() {
    if (this.clearEvent) {
      return this.clearEvent.type;
    }
    return this.event.type;
  }

  /**
   * Get the (possibly encrypted) type of the event that will be sent to the
   * homeserver.
   *
   * @returns The event type.
   */
  getWireType() {
    return this.event.type;
  }

  /**
   * Get the room_id for this event. This will return `undefined`
   * for `m.presence` events.
   * @returns The room ID, e.g. <code>!cURbafjkfsMDVwdRDQ:matrix.org
   * </code>
   */
  getRoomId() {
    return this.event.room_id;
  }

  /**
   * Get the timestamp of this event.
   * @returns The event timestamp, e.g. `1433502692297`
   */
  getTs() {
    return this.event.origin_server_ts;
  }

  /**
   * Get the timestamp of this event, as a Date object.
   * @returns The event date, e.g. `new Date(1433502692297)`
   */
  getDate() {
    return this.event.origin_server_ts ? new Date(this.event.origin_server_ts) : null;
  }

  /**
   * Get a string containing details of this event
   *
   * This is intended for logging, to help trace errors. Example output:
   *
   * @example
   * ```
   * id=$HjnOHV646n0SjLDAqFrgIjim7RCpB7cdMXFrekWYAn type=m.room.encrypted
   * sender=@user:example.com room=!room:example.com ts=2022-10-25T17:30:28.404Z
   * ```
   */
  getDetails() {
    let details = `id=${this.getId()} type=${this.getWireType()} sender=${this.getSender()}`;
    const room = this.getRoomId();
    if (room) {
      details += ` room=${room}`;
    }
    const date = this.getDate();
    if (date) {
      details += ` ts=${date.toISOString()}`;
    }
    return details;
  }

  /**
   * Get the (decrypted, if necessary) event content JSON, even if the event
   * was replaced by another event.
   *
   * @returns The event content JSON, or an empty object.
   */
  getOriginalContent() {
    if (this._localRedactionEvent) {
      return {};
    }
    if (this.clearEvent) {
      return this.clearEvent.content || {};
    }
    return this.event.content || {};
  }

  /**
   * Get the (decrypted, if necessary) event content JSON,
   * or the content from the replacing event, if any.
   * See `makeReplaced`.
   *
   * @returns The event content JSON, or an empty object.
   */
  getContent() {
    if (this._localRedactionEvent) {
      return {};
    } else if (this._replacingEvent) {
      return this._replacingEvent.getContent()["m.new_content"] || {};
    } else {
      return this.getOriginalContent();
    }
  }

  /**
   * Get the (possibly encrypted) event content JSON that will be sent to the
   * homeserver.
   *
   * @returns The event content JSON, or an empty object.
   */
  getWireContent() {
    return this.event.content || {};
  }

  /**
   * Get the event ID of the thread head
   */
  get threadRootId() {
    const relatesTo = this.getWireContent()?.["m.relates_to"];
    if (relatesTo?.rel_type === _thread.THREAD_RELATION_TYPE.name) {
      return relatesTo.event_id;
    } else {
      return this.getThread()?.id || this.threadId;
    }
  }

  /**
   * A helper to check if an event is a thread's head or not
   */
  get isThreadRoot() {
    const threadDetails = this.getServerAggregatedRelation(_thread.THREAD_RELATION_TYPE.name);

    // Bundled relationships only returned when the sync response is limited
    // hence us having to check both bundled relation and inspect the thread
    // model
    return !!threadDetails || this.getThread()?.id === this.getId();
  }
  get replyEventId() {
    return this.getWireContent()["m.relates_to"]?.["m.in_reply_to"]?.event_id;
  }
  get relationEventId() {
    return this.getWireContent()?.["m.relates_to"]?.event_id;
  }

  /**
   * Get the previous event content JSON. This will only return something for
   * state events which exist in the timeline.
   * @returns The previous event content JSON, or an empty object.
   */
  getPrevContent() {
    // v2 then v1 then default
    return this.getUnsigned().prev_content || this.event.prev_content || {};
  }

  /**
   * Get either 'content' or 'prev_content' depending on if this event is
   * 'forward-looking' or not. This can be modified via event.forwardLooking.
   * In practice, this means we get the chronologically earlier content value
   * for this event (this method should surely be called getEarlierContent)
   * <strong>This method is experimental and may change.</strong>
   * @returns event.content if this event is forward-looking, else
   * event.prev_content.
   */
  getDirectionalContent() {
    return this.forwardLooking ? this.getContent() : this.getPrevContent();
  }

  /**
   * Get the age of this event. This represents the age of the event when the
   * event arrived at the device, and not the age of the event when this
   * function was called.
   * Can only be returned once the server has echo'ed back
   * @returns The age of this event in milliseconds.
   */
  getAge() {
    return this.getUnsigned().age || this.event.age; // v2 / v1
  }

  /**
   * Get the age of the event when this function was called.
   * This is the 'age' field adjusted according to how long this client has
   * had the event.
   * @returns The age of this event in milliseconds.
   */
  getLocalAge() {
    return Date.now() - this.localTimestamp;
  }

  /**
   * Get the event state_key if it has one. This will return <code>undefined
   * </code> for message events.
   * @returns The event's `state_key`.
   */
  getStateKey() {
    return this.event.state_key;
  }

  /**
   * Check if this event is a state event.
   * @returns True if this is a state event.
   */
  isState() {
    return this.event.state_key !== undefined;
  }

  /**
   * Replace the content of this event with encrypted versions.
   * (This is used when sending an event; it should not be used by applications).
   *
   * @internal
   *
   * @param cryptoType - type of the encrypted event - typically
   * <tt>"m.room.encrypted"</tt>
   *
   * @param cryptoContent - raw 'content' for the encrypted event.
   *
   * @param senderCurve25519Key - curve25519 key to record for the
   *   sender of this event.
   *   See {@link MatrixEvent#getSenderKey}.
   *
   * @param claimedEd25519Key - claimed ed25519 key to record for the
   *   sender if this event.
   *   See {@link MatrixEvent#getClaimedEd25519Key}
   */
  makeEncrypted(cryptoType, cryptoContent, senderCurve25519Key, claimedEd25519Key) {
    // keep the plain-text data for 'view source'
    this.clearEvent = {
      type: this.event.type,
      content: this.event.content
    };
    this.event.type = cryptoType;
    this.event.content = cryptoContent;
    this.senderCurve25519Key = senderCurve25519Key;
    this.claimedEd25519Key = claimedEd25519Key;
  }

  /**
   * Check if this event is currently being decrypted.
   *
   * @returns True if this event is currently being decrypted, else false.
   */
  isBeingDecrypted() {
    return this.decryptionPromise != null;
  }
  getDecryptionPromise() {
    return this.decryptionPromise;
  }

  /**
   * Check if this event is an encrypted event which we failed to decrypt
   *
   * (This implies that we might retry decryption at some point in the future)
   *
   * @returns True if this event is an encrypted event which we
   *     couldn't decrypt.
   */
  isDecryptionFailure() {
    return this.clearEvent?.content?.msgtype === "m.bad.encrypted";
  }

  /*
   * True if this event is an encrypted event which we failed to decrypt, the receiver's device is unverified and
   * the sender has disabled encrypting to unverified devices.
   */
  get isEncryptedDisabledForUnverifiedDevices() {
    return this.isDecryptionFailure() && this.encryptedDisabledForUnverifiedDevices;
  }
  shouldAttemptDecryption() {
    if (this.isRedacted()) return false;
    if (this.isBeingDecrypted()) return false;
    if (this.clearEvent) return false;
    if (!this.isEncrypted()) return false;
    return true;
  }

  /**
   * Start the process of trying to decrypt this event.
   *
   * (This is used within the SDK: it isn't intended for use by applications)
   *
   * @internal
   *
   * @param crypto - crypto module
   *
   * @returns promise which resolves (to undefined) when the decryption
   * attempt is completed.
   */
  async attemptDecryption(crypto, options = {}) {
    // start with a couple of sanity checks.
    if (!this.isEncrypted()) {
      throw new Error("Attempt to decrypt event which isn't encrypted");
    }
    const alreadyDecrypted = this.clearEvent && !this.isDecryptionFailure();
    const forceRedecrypt = options.forceRedecryptIfUntrusted && this.isKeySourceUntrusted();
    if (alreadyDecrypted && !forceRedecrypt) {
      // we may want to just ignore this? let's start with rejecting it.
      throw new Error("Attempt to decrypt event which has already been decrypted");
    }

    // if we already have a decryption attempt in progress, then it may
    // fail because it was using outdated info. We now have reason to
    // succeed where it failed before, but we don't want to have multiple
    // attempts going at the same time, so just set a flag that says we have
    // new info.
    //
    if (this.decryptionPromise) {
      _logger.logger.log(`Event ${this.getId()} already being decrypted; queueing a retry`);
      this.retryDecryption = true;
      return this.decryptionPromise;
    }
    this.decryptionPromise = this.decryptionLoop(crypto, options);
    return this.decryptionPromise;
  }

  /**
   * Cancel any room key request for this event and resend another.
   *
   * @param crypto - crypto module
   * @param userId - the user who received this event
   *
   * @returns a promise that resolves when the request is queued
   */
  cancelAndResendKeyRequest(crypto, userId) {
    const wireContent = this.getWireContent();
    return crypto.requestRoomKey({
      algorithm: wireContent.algorithm,
      room_id: this.getRoomId(),
      session_id: wireContent.session_id,
      sender_key: wireContent.sender_key
    }, this.getKeyRequestRecipients(userId), true);
  }

  /**
   * Calculate the recipients for keyshare requests.
   *
   * @param userId - the user who received this event.
   *
   * @returns array of recipients
   */
  getKeyRequestRecipients(userId) {
    // send the request to all of our own devices
    const recipients = [{
      userId,
      deviceId: "*"
    }];
    return recipients;
  }
  async decryptionLoop(crypto, options = {}) {
    // make sure that this method never runs completely synchronously.
    // (doing so would mean that we would clear decryptionPromise *before*
    // it is set in attemptDecryption - and hence end up with a stuck
    // `decryptionPromise`).
    await Promise.resolve();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      this.retryDecryption = false;
      let res;
      let err = undefined;
      try {
        if (!crypto) {
          res = this.badEncryptedMessage("Encryption not enabled");
        } else {
          res = await crypto.decryptEvent(this);
          if (options.isRetry === true) {
            _logger.logger.info(`Decrypted event on retry (${this.getDetails()})`);
          }
        }
      } catch (e) {
        const detailedError = e instanceof _algorithms.DecryptionError ? e.detailedString : String(e);
        err = e;

        // see if we have a retry queued.
        //
        // NB: make sure to keep this check in the same tick of the
        //   event loop as `decryptionPromise = null` below - otherwise we
        //   risk a race:
        //
        //   * A: we check retryDecryption here and see that it is
        //        false
        //   * B: we get a second call to attemptDecryption, which sees
        //        that decryptionPromise is set so sets
        //        retryDecryption
        //   * A: we continue below, clear decryptionPromise, and
        //        never do the retry.
        //
        if (this.retryDecryption) {
          // decryption error, but we have a retry queued.
          _logger.logger.log(`Error decrypting event (${this.getDetails()}), but retrying: ${detailedError}`);
          continue;
        }

        // decryption error, no retries queued. Warn about the error and
        // set it to m.bad.encrypted.
        //
        // the detailedString already includes the name and message of the error, and the stack isn't much use,
        // so we don't bother to log `e` separately.
        _logger.logger.warn(`Error decrypting event (${this.getDetails()}): ${detailedError}`);
        res = this.badEncryptedMessage(String(e));
      }

      // at this point, we've either successfully decrypted the event, or have given up
      // (and set res to a 'badEncryptedMessage'). Either way, we can now set the
      // cleartext of the event and raise Event.decrypted.
      //
      // make sure we clear 'decryptionPromise' before sending the 'Event.decrypted' event,
      // otherwise the app will be confused to see `isBeingDecrypted` still set when
      // there isn't an `Event.decrypted` on the way.
      //
      // see also notes on retryDecryption above.
      //
      this.decryptionPromise = null;
      this.retryDecryption = false;
      this.setClearData(res);

      // Before we emit the event, clear the push actions so that they can be recalculated
      // by relevant code. We do this because the clear event has now changed, making it
      // so that existing rules can be re-run over the applicable properties. Stuff like
      // highlighting when the user's name is mentioned rely on this happening. We also want
      // to set the push actions before emitting so that any notification listeners don't
      // pick up the wrong contents.
      this.setPushDetails();
      if (options.emit !== false) {
        this.emit(MatrixEventEvent.Decrypted, this, err);
      }
      return;
    }
  }
  badEncryptedMessage(reason) {
    return {
      clearEvent: {
        type: _event.EventType.RoomMessage,
        content: {
          msgtype: "m.bad.encrypted",
          body: "** Unable to decrypt: " + reason + " **"
        }
      },
      encryptedDisabledForUnverifiedDevices: reason === `DecryptionError: ${_OlmDevice.WITHHELD_MESSAGES["m.unverified"]}`
    };
  }

  /**
   * Update the cleartext data on this event.
   *
   * (This is used after decrypting an event; it should not be used by applications).
   *
   * @internal
   *
   * @param decryptionResult - the decryption result, including the plaintext and some key info
   *
   * @remarks
   * Fires {@link MatrixEventEvent.Decrypted}
   */
  setClearData(decryptionResult) {
    this.clearEvent = decryptionResult.clearEvent;
    this.senderCurve25519Key = decryptionResult.senderCurve25519Key ?? null;
    this.claimedEd25519Key = decryptionResult.claimedEd25519Key ?? null;
    this.forwardingCurve25519KeyChain = decryptionResult.forwardingCurve25519KeyChain || [];
    this.untrusted = decryptionResult.untrusted || false;
    this.encryptedDisabledForUnverifiedDevices = decryptionResult.encryptedDisabledForUnverifiedDevices || false;
    this.invalidateExtensibleEvent();
  }

  /**
   * Gets the cleartext content for this event. If the event is not encrypted,
   * or encryption has not been completed, this will return null.
   *
   * @returns The cleartext (decrypted) content for the event
   */
  getClearContent() {
    return this.clearEvent ? this.clearEvent.content : null;
  }

  /**
   * Check if the event is encrypted.
   * @returns True if this event is encrypted.
   */
  isEncrypted() {
    return !this.isState() && this.event.type === _event.EventType.RoomMessageEncrypted;
  }

  /**
   * The curve25519 key for the device that we think sent this event
   *
   * For an Olm-encrypted event, this is inferred directly from the DH
   * exchange at the start of the session: the curve25519 key is involved in
   * the DH exchange, so only a device which holds the private part of that
   * key can establish such a session.
   *
   * For a megolm-encrypted event, it is inferred from the Olm message which
   * established the megolm session
   */
  getSenderKey() {
    return this.senderCurve25519Key;
  }

  /**
   * The additional keys the sender of this encrypted event claims to possess.
   *
   * Just a wrapper for #getClaimedEd25519Key (q.v.)
   */
  getKeysClaimed() {
    if (!this.claimedEd25519Key) return {};
    return {
      ed25519: this.claimedEd25519Key
    };
  }

  /**
   * Get the ed25519 the sender of this event claims to own.
   *
   * For Olm messages, this claim is encoded directly in the plaintext of the
   * event itself. For megolm messages, it is implied by the m.room_key event
   * which established the megolm session.
   *
   * Until we download the device list of the sender, it's just a claim: the
   * device list gives a proof that the owner of the curve25519 key used for
   * this event (and returned by #getSenderKey) also owns the ed25519 key by
   * signing the public curve25519 key with the ed25519 key.
   *
   * In general, applications should not use this method directly, but should
   * instead use MatrixClient.getEventSenderDeviceInfo.
   */
  getClaimedEd25519Key() {
    return this.claimedEd25519Key;
  }

  /**
   * Get the curve25519 keys of the devices which were involved in telling us
   * about the claimedEd25519Key and sender curve25519 key.
   *
   * Normally this will be empty, but in the case of a forwarded megolm
   * session, the sender keys are sent to us by another device (the forwarding
   * device), which we need to trust to do this. In that case, the result will
   * be a list consisting of one entry.
   *
   * If the device that sent us the key (A) got it from another device which
   * it wasn't prepared to vouch for (B), the result will be [A, B]. And so on.
   *
   * @returns base64-encoded curve25519 keys, from oldest to newest.
   */
  getForwardingCurve25519KeyChain() {
    return this.forwardingCurve25519KeyChain;
  }

  /**
   * Whether the decryption key was obtained from an untrusted source. If so,
   * we cannot verify the authenticity of the message.
   */
  isKeySourceUntrusted() {
    return !!this.untrusted;
  }
  getUnsigned() {
    return this.event.unsigned || {};
  }
  setUnsigned(unsigned) {
    this.event.unsigned = unsigned;
  }
  unmarkLocallyRedacted() {
    const value = this._localRedactionEvent;
    this._localRedactionEvent = null;
    if (this.event.unsigned) {
      this.event.unsigned.redacted_because = undefined;
    }
    return !!value;
  }
  markLocallyRedacted(redactionEvent) {
    if (this._localRedactionEvent) return;
    this.emit(MatrixEventEvent.BeforeRedaction, this, redactionEvent);
    this._localRedactionEvent = redactionEvent;
    if (!this.event.unsigned) {
      this.event.unsigned = {};
    }
    this.event.unsigned.redacted_because = redactionEvent.event;
  }

  /**
   * Change the visibility of an event, as per https://github.com/matrix-org/matrix-doc/pull/3531 .
   *
   * @param visibilityChange - event holding a hide/unhide payload, or nothing
   *   if the event is being reset to its original visibility (presumably
   *   by a visibility event being redacted).
   *
   * @remarks
   * Fires {@link MatrixEventEvent.VisibilityChange} if `visibilityEvent`
   *   caused a change in the actual visibility of this event, either by making it
   *   visible (if it was hidden), by making it hidden (if it was visible) or by
   *   changing the reason (if it was hidden).
   */
  applyVisibilityEvent(visibilityChange) {
    const visible = visibilityChange?.visible ?? true;
    const reason = visibilityChange?.reason ?? null;
    let change = false;
    if (this.visibility.visible !== visible) {
      change = true;
    } else if (!this.visibility.visible && this.visibility["reason"] !== reason) {
      change = true;
    }
    if (change) {
      if (visible) {
        this.visibility = MESSAGE_VISIBLE;
      } else {
        this.visibility = Object.freeze({
          visible: false,
          reason
        });
      }
      this.emit(MatrixEventEvent.VisibilityChange, this, visible);
    }
  }

  /**
   * Return instructions to display or hide the message.
   *
   * @returns Instructions determining whether the message
   * should be displayed.
   */
  messageVisibility() {
    // Note: We may return `this.visibility` without fear, as
    // this is a shallow frozen object.
    return this.visibility;
  }

  /**
   * Update the content of an event in the same way it would be by the server
   * if it were redacted before it was sent to us
   *
   * @param redactionEvent - event causing the redaction
   */
  makeRedacted(redactionEvent) {
    // quick sanity-check
    if (!redactionEvent.event) {
      throw new Error("invalid redactionEvent in makeRedacted");
    }
    this._localRedactionEvent = null;
    this.emit(MatrixEventEvent.BeforeRedaction, this, redactionEvent);
    this._replacingEvent = null;
    // we attempt to replicate what we would see from the server if
    // the event had been redacted before we saw it.
    //
    // The server removes (most of) the content of the event, and adds a
    // "redacted_because" key to the unsigned section containing the
    // redacted event.
    if (!this.event.unsigned) {
      this.event.unsigned = {};
    }
    this.event.unsigned.redacted_because = redactionEvent.event;
    for (const key in this.event) {
      if (this.event.hasOwnProperty(key) && !REDACT_KEEP_KEYS.has(key)) {
        delete this.event[key];
      }
    }

    // If the event is encrypted prune the decrypted bits
    if (this.isEncrypted()) {
      this.clearEvent = undefined;
    }
    const keeps = this.getType() in REDACT_KEEP_CONTENT_MAP ? REDACT_KEEP_CONTENT_MAP[this.getType()] : {};
    const content = this.getContent();
    for (const key in content) {
      if (content.hasOwnProperty(key) && !keeps[key]) {
        delete content[key];
      }
    }
    this.invalidateExtensibleEvent();
  }

  /**
   * Check if this event has been redacted
   *
   * @returns True if this event has been redacted
   */
  isRedacted() {
    return Boolean(this.getUnsigned().redacted_because);
  }

  /**
   * Check if this event is a redaction of another event
   *
   * @returns True if this event is a redaction
   */
  isRedaction() {
    return this.getType() === _event.EventType.RoomRedaction;
  }

  /**
   * Return the visibility change caused by this event,
   * as per https://github.com/matrix-org/matrix-doc/pull/3531.
   *
   * @returns If the event is a well-formed visibility change event,
   * an instance of `IVisibilityChange`, otherwise `null`.
   */
  asVisibilityChange() {
    if (!_event.EVENT_VISIBILITY_CHANGE_TYPE.matches(this.getType())) {
      // Not a visibility change event.
      return null;
    }
    const relation = this.getRelation();
    if (!relation || relation.rel_type != "m.reference") {
      // Ill-formed, ignore this event.
      return null;
    }
    const eventId = relation.event_id;
    if (!eventId) {
      // Ill-formed, ignore this event.
      return null;
    }
    const content = this.getWireContent();
    const visible = !!content.visible;
    const reason = content.reason;
    if (reason && typeof reason != "string") {
      // Ill-formed, ignore this event.
      return null;
    }
    // Well-formed visibility change event.
    return {
      visible,
      reason,
      eventId
    };
  }

  /**
   * Check if this event alters the visibility of another event,
   * as per https://github.com/matrix-org/matrix-doc/pull/3531.
   *
   * @returns True if this event alters the visibility
   * of another event.
   */
  isVisibilityEvent() {
    return _event.EVENT_VISIBILITY_CHANGE_TYPE.matches(this.getType());
  }

  /**
   * Get the (decrypted, if necessary) redaction event JSON
   * if event was redacted
   *
   * @returns The redaction event JSON, or an empty object
   */
  getRedactionEvent() {
    if (!this.isRedacted()) return null;
    if (this.clearEvent?.unsigned) {
      return this.clearEvent?.unsigned.redacted_because ?? null;
    } else if (this.event.unsigned?.redacted_because) {
      return this.event.unsigned.redacted_because;
    } else {
      return {};
    }
  }

  /**
   * Get the push actions, if known, for this event
   *
   * @returns push actions
   */
  getPushActions() {
    return this.pushDetails.actions || null;
  }

  /**
   * Get the push details, if known, for this event
   *
   * @returns push actions
   */
  getPushDetails() {
    return this.pushDetails;
  }

  /**
   * Set the push actions for this event.
   * Clears rule from push details if present
   * @deprecated use `setPushDetails`
   *
   * @param pushActions - push actions
   */
  setPushActions(pushActions) {
    this.pushDetails = {
      actions: pushActions || undefined
    };
  }

  /**
   * Set the push details for this event.
   *
   * @param pushActions - push actions
   * @param rule - the executed push rule
   */
  setPushDetails(pushActions, rule) {
    this.pushDetails = {
      actions: pushActions,
      rule
    };
  }

  /**
   * Replace the `event` property and recalculate any properties based on it.
   * @param event - the object to assign to the `event` property
   */
  handleRemoteEcho(event) {
    const oldUnsigned = this.getUnsigned();
    const oldId = this.getId();
    this.event = event;
    // if this event was redacted before it was sent, it's locally marked as redacted.
    // At this point, we've received the remote echo for the event, but not yet for
    // the redaction that we are sending ourselves. Preserve the locally redacted
    // state by copying over redacted_because so we don't get a flash of
    // redacted, not-redacted, redacted as remote echos come in
    if (oldUnsigned.redacted_because) {
      if (!this.event.unsigned) {
        this.event.unsigned = {};
      }
      this.event.unsigned.redacted_because = oldUnsigned.redacted_because;
    }
    // successfully sent.
    this.setStatus(null);
    if (this.getId() !== oldId) {
      // emit the event if it changed
      this.emit(MatrixEventEvent.LocalEventIdReplaced, this);
    }
    this.localTimestamp = Date.now() - this.getAge();
  }

  /**
   * Whether the event is in any phase of sending, send failure, waiting for
   * remote echo, etc.
   */
  isSending() {
    return !!this.status;
  }

  /**
   * Update the event's sending status and emit an event as well.
   *
   * @param status - The new status
   */
  setStatus(status) {
    this.status = status;
    this.emit(MatrixEventEvent.Status, this, status);
  }
  replaceLocalEventId(eventId) {
    this.event.event_id = eventId;
    this.emit(MatrixEventEvent.LocalEventIdReplaced, this);
  }

  /**
   * Get whether the event is a relation event, and of a given type if
   * `relType` is passed in. State events cannot be relation events
   *
   * @param relType - if given, checks that the relation is of the
   * given type
   */
  isRelation(relType) {
    // Relation info is lifted out of the encrypted content when sent to
    // encrypted rooms, so we have to check `getWireContent` for this.
    const relation = this.getWireContent()?.["m.relates_to"];
    if (this.isState() && relation?.rel_type === _event.RelationType.Replace) {
      // State events cannot be m.replace relations
      return false;
    }
    return !!(relation?.rel_type && relation.event_id && (relType ? relation.rel_type === relType : true));
  }

  /**
   * Get relation info for the event, if any.
   */
  getRelation() {
    if (!this.isRelation()) {
      return null;
    }
    return this.getWireContent()["m.relates_to"] ?? null;
  }

  /**
   * Set an event that replaces the content of this event, through an m.replace relation.
   *
   * @param newEvent - the event with the replacing content, if any.
   *
   * @remarks
   * Fires {@link MatrixEventEvent.Replaced}
   */
  makeReplaced(newEvent) {
    // don't allow redacted events to be replaced.
    // if newEvent is null we allow to go through though,
    // as with local redaction, the replacing event might get
    // cancelled, which should be reflected on the target event.
    if (this.isRedacted() && newEvent) {
      return;
    }
    // don't allow state events to be replaced using this mechanism as per MSC2676
    if (this.isState()) {
      return;
    }
    if (this._replacingEvent !== newEvent) {
      this._replacingEvent = newEvent ?? null;
      this.emit(MatrixEventEvent.Replaced, this);
      this.invalidateExtensibleEvent();
    }
  }

  /**
   * Returns the status of any associated edit or redaction
   * (not for reactions/annotations as their local echo doesn't affect the original event),
   * or else the status of the event.
   */
  getAssociatedStatus() {
    if (this._replacingEvent) {
      return this._replacingEvent.status;
    } else if (this._localRedactionEvent) {
      return this._localRedactionEvent.status;
    }
    return this.status;
  }
  getServerAggregatedRelation(relType) {
    return this.getUnsigned()["m.relations"]?.[relType];
  }

  /**
   * Returns the event ID of the event replacing the content of this event, if any.
   */
  replacingEventId() {
    const replaceRelation = this.getServerAggregatedRelation(_event.RelationType.Replace);
    if (replaceRelation) {
      return replaceRelation.event_id;
    } else if (this._replacingEvent) {
      return this._replacingEvent.getId();
    }
  }

  /**
   * Returns the event replacing the content of this event, if any.
   * Replacements are aggregated on the server, so this would only
   * return an event in case it came down the sync, or for local echo of edits.
   */
  replacingEvent() {
    return this._replacingEvent;
  }

  /**
   * Returns the origin_server_ts of the event replacing the content of this event, if any.
   */
  replacingEventDate() {
    const replaceRelation = this.getServerAggregatedRelation(_event.RelationType.Replace);
    if (replaceRelation) {
      const ts = replaceRelation.origin_server_ts;
      if (Number.isFinite(ts)) {
        return new Date(ts);
      }
    } else if (this._replacingEvent) {
      return this._replacingEvent.getDate() ?? undefined;
    }
  }

  /**
   * Returns the event that wants to redact this event, but hasn't been sent yet.
   * @returns the event
   */
  localRedactionEvent() {
    return this._localRedactionEvent;
  }

  /**
   * For relations and redactions, returns the event_id this event is referring to.
   */
  getAssociatedId() {
    const relation = this.getRelation();
    if (this.replyEventId) {
      return this.replyEventId;
    } else if (relation) {
      return relation.event_id;
    } else if (this.isRedaction()) {
      return this.event.redacts;
    }
  }

  /**
   * Checks if this event is associated with another event. See `getAssociatedId`.
   * @deprecated use hasAssociation instead.
   */
  hasAssocation() {
    return !!this.getAssociatedId();
  }

  /**
   * Checks if this event is associated with another event. See `getAssociatedId`.
   */
  hasAssociation() {
    return !!this.getAssociatedId();
  }

  /**
   * Update the related id with a new one.
   *
   * Used to replace a local id with remote one before sending
   * an event with a related id.
   *
   * @param eventId - the new event id
   */
  updateAssociatedId(eventId) {
    const relation = this.getRelation();
    if (relation) {
      relation.event_id = eventId;
    } else if (this.isRedaction()) {
      this.event.redacts = eventId;
    }
  }

  /**
   * Flags an event as cancelled due to future conditions. For example, a verification
   * request event in the same sync transaction may be flagged as cancelled to warn
   * listeners that a cancellation event is coming down the same pipe shortly.
   * @param cancelled - Whether the event is to be cancelled or not.
   */
  flagCancelled(cancelled = true) {
    this._isCancelled = cancelled;
  }

  /**
   * Gets whether or not the event is flagged as cancelled. See flagCancelled() for
   * more information.
   * @returns True if the event is cancelled, false otherwise.
   */
  isCancelled() {
    return this._isCancelled;
  }

  /**
   * Get a copy/snapshot of this event. The returned copy will be loosely linked
   * back to this instance, though will have "frozen" event information. Other
   * properties of this MatrixEvent instance will be copied verbatim, which can
   * mean they are in reference to this instance despite being on the copy too.
   * The reference the snapshot uses does not change, however members aside from
   * the underlying event will not be deeply cloned, thus may be mutated internally.
   * For example, the sender profile will be copied over at snapshot time, and
   * the sender profile internally may mutate without notice to the consumer.
   *
   * This is meant to be used to snapshot the event details themselves, not the
   * features (such as sender) surrounding the event.
   * @returns A snapshot of this event.
   */
  toSnapshot() {
    const ev = new MatrixEvent(JSON.parse(JSON.stringify(this.event)));
    for (const [p, v] of Object.entries(this)) {
      if (p !== "event") {
        // exclude the thing we just cloned
        // @ts-ignore - XXX: this is just nasty
        ev[p] = v;
      }
    }
    return ev;
  }

  /**
   * Determines if this event is equivalent to the given event. This only checks
   * the event object itself, not the other properties of the event. Intended for
   * use with toSnapshot() to identify events changing.
   * @param otherEvent - The other event to check against.
   * @returns True if the events are the same, false otherwise.
   */
  isEquivalentTo(otherEvent) {
    if (!otherEvent) return false;
    if (otherEvent === this) return true;
    const myProps = (0, _utils.deepSortedObjectEntries)(this.event);
    const theirProps = (0, _utils.deepSortedObjectEntries)(otherEvent.event);
    return JSON.stringify(myProps) === JSON.stringify(theirProps);
  }

  /**
   * Summarise the event as JSON. This is currently used by React SDK's view
   * event source feature and Seshat's event indexing, so take care when
   * adjusting the output here.
   *
   * If encrypted, include both the decrypted and encrypted view of the event.
   *
   * This is named `toJSON` for use with `JSON.stringify` which checks objects
   * for functions named `toJSON` and will call them to customise the output
   * if they are defined.
   */
  toJSON() {
    const event = this.getEffectiveEvent();
    if (!this.isEncrypted()) {
      return event;
    }
    return {
      decrypted: event,
      encrypted: this.event
    };
  }
  setVerificationRequest(request) {
    this.verificationRequest = request;
  }
  setTxnId(txnId) {
    this.txnId = txnId;
  }
  getTxnId() {
    return this.txnId;
  }

  /**
   * Set the instance of a thread associated with the current event
   * @param thread - the thread
   */
  setThread(thread) {
    if (this.thread) {
      this.reEmitter.stopReEmitting(this.thread, [_thread.ThreadEvent.Update]);
    }
    this.thread = thread;
    this.setThreadId(thread?.id);
    if (thread) {
      this.reEmitter.reEmit(thread, [_thread.ThreadEvent.Update]);
    }
  }

  /**
   * Get the instance of the thread associated with the current event
   */
  getThread() {
    return this.thread;
  }
  setThreadId(threadId) {
    this.threadId = threadId;
  }
}

/* REDACT_KEEP_KEYS gives the keys we keep when an event is redacted
 *
 * This is specified here:
 *  http://matrix.org/speculator/spec/HEAD/client_server/latest.html#redactions
 *
 * Also:
 *  - We keep 'unsigned' since that is created by the local server
 *  - We keep user_id for backwards-compat with v1
 */
exports.MatrixEvent = MatrixEvent;
const REDACT_KEEP_KEYS = new Set(["event_id", "type", "room_id", "user_id", "sender", "state_key", "prev_state", "content", "unsigned", "origin_server_ts"]);

// a map from state event type to the .content keys we keep when an event is redacted
const REDACT_KEEP_CONTENT_MAP = {
  [_event.EventType.RoomMember]: {
    membership: 1
  },
  [_event.EventType.RoomCreate]: {
    creator: 1
  },
  [_event.EventType.RoomJoinRules]: {
    join_rule: 1
  },
  [_event.EventType.RoomPowerLevels]: {
    ban: 1,
    events: 1,
    events_default: 1,
    kick: 1,
    redact: 1,
    state_default: 1,
    users: 1,
    users_default: 1
  }
};