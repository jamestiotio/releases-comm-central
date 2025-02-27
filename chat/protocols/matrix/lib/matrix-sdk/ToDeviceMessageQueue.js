"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ToDeviceMessageQueue = void 0;
var _event = require("./@types/event");
var _logger = require("./logger");
var _client = require("./client");
var _scheduler = require("./scheduler");
var _sync = require("./sync");
var _utils = require("./utils");
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /*
                                                                                                                                                                                                                                                                                                                                                                                          Copyright 2022 The Matrix.org Foundation C.I.C.
                                                                                                                                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                                                                                                          Licensed under the Apache License, Version 2.0 (the "License");
                                                                                                                                                                                                                                                                                                                                                                                          you may not use this file except in compliance with the License.
                                                                                                                                                                                                                                                                                                                                                                                          You may obtain a copy of the License at
                                                                                                                                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                                                                                                              http://www.apache.org/licenses/LICENSE-2.0
                                                                                                                                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                                                                                                          Unless required by applicable law or agreed to in writing, software
                                                                                                                                                                                                                                                                                                                                                                                          distributed under the License is distributed on an "AS IS" BASIS,
                                                                                                                                                                                                                                                                                                                                                                                          WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
                                                                                                                                                                                                                                                                                                                                                                                          See the License for the specific language governing permissions and
                                                                                                                                                                                                                                                                                                                                                                                          limitations under the License.
                                                                                                                                                                                                                                                                                                                                                                                          */
const MAX_BATCH_SIZE = 20;

/**
 * Maintains a queue of outgoing to-device messages, sending them
 * as soon as the homeserver is reachable.
 */
class ToDeviceMessageQueue {
  constructor(client) {
    this.client = client;
    _defineProperty(this, "sending", false);
    _defineProperty(this, "running", true);
    _defineProperty(this, "retryTimeout", null);
    _defineProperty(this, "retryAttempts", 0);
    _defineProperty(this, "sendQueue", async () => {
      if (this.retryTimeout !== null) clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
      if (this.sending || !this.running) return;
      _logger.logger.debug("Attempting to send queued to-device messages");
      this.sending = true;
      let headBatch;
      try {
        while (this.running) {
          headBatch = await this.client.store.getOldestToDeviceBatch();
          if (headBatch === null) break;
          await this.sendBatch(headBatch);
          await this.client.store.removeToDeviceBatch(headBatch.id);
          this.retryAttempts = 0;
        }

        // Make sure we're still running after the async tasks: if not, stop.
        if (!this.running) return;
        _logger.logger.debug("All queued to-device messages sent");
      } catch (e) {
        ++this.retryAttempts;
        // eslint-disable-next-line @typescript-eslint/naming-convention
        // eslint-disable-next-line new-cap
        const retryDelay = _scheduler.MatrixScheduler.RETRY_BACKOFF_RATELIMIT(null, this.retryAttempts, e);
        if (retryDelay === -1) {
          // the scheduler function doesn't differentiate between fatal errors and just getting
          // bored and giving up for now
          if (Math.floor(e.httpStatus / 100) === 4) {
            _logger.logger.error("Fatal error when sending to-device message - dropping to-device batch!", e);
            await this.client.store.removeToDeviceBatch(headBatch.id);
          } else {
            _logger.logger.info("Automatic retry limit reached for to-device messages.");
          }
          return;
        }
        _logger.logger.info(`Failed to send batch of to-device messages. Will retry in ${retryDelay}ms`, e);
        this.retryTimeout = setTimeout(this.sendQueue, retryDelay);
      } finally {
        this.sending = false;
      }
    });
    /**
     * Listen to sync state changes and automatically resend any pending events
     * once syncing is resumed
     */
    _defineProperty(this, "onResumedSync", (state, oldState) => {
      if (state === _sync.SyncState.Syncing && oldState !== _sync.SyncState.Syncing) {
        _logger.logger.info(`Resuming queue after resumed sync`);
        this.sendQueue();
      }
    });
  }
  start() {
    this.running = true;
    this.sendQueue();
    this.client.on(_client.ClientEvent.Sync, this.onResumedSync);
  }
  stop() {
    this.running = false;
    if (this.retryTimeout !== null) clearTimeout(this.retryTimeout);
    this.retryTimeout = null;
    this.client.removeListener(_client.ClientEvent.Sync, this.onResumedSync);
  }
  async queueBatch(batch) {
    const batches = [];
    for (let i = 0; i < batch.batch.length; i += MAX_BATCH_SIZE) {
      const batchWithTxnId = {
        eventType: batch.eventType,
        batch: batch.batch.slice(i, i + MAX_BATCH_SIZE),
        txnId: this.client.makeTxnId()
      };
      batches.push(batchWithTxnId);
      const msgmap = batchWithTxnId.batch.map(msg => `${msg.userId}/${msg.deviceId} (msgid ${msg.payload[_event.ToDeviceMessageId]})`);
      _logger.logger.info(`Enqueuing batch of to-device messages. type=${batch.eventType} txnid=${batchWithTxnId.txnId}`, msgmap);
    }
    await this.client.store.saveToDeviceBatches(batches);
    this.sendQueue();
  }
  /**
   * Attempts to send a batch of to-device messages.
   */
  async sendBatch(batch) {
    const contentMap = new _utils.MapWithDefault(() => new Map());
    for (const item of batch.batch) {
      contentMap.getOrCreate(item.userId).set(item.deviceId, item.payload);
    }
    _logger.logger.info(`Sending batch of ${batch.batch.length} to-device messages with ID ${batch.id} and txnId ${batch.txnId}`);
    await this.client.sendToDevice(batch.eventType, contentMap, batch.txnId);
  }
}
exports.ToDeviceMessageQueue = ToDeviceMessageQueue;