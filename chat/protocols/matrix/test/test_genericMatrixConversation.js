/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");
var matrix = {};
Services.scriptloader.loadSubScript("resource:///modules/matrix.jsm", matrix);
Services.conversations.initConversations();

add_task(async function test_sharedInit() {
  const roomStub = {};
  matrix.GenericMatrixConversation.sharedInit.call(roomStub);
  equal(typeof roomStub._setInitialized, "function");
  ok(roomStub._initialized);
  roomStub._setInitialized();
  await roomStub._initialized;
});

add_task(function test_replaceRoom() {
  const roomStub = {
    _setInitialized() {
      this.initialized = true;
    },
    _mostRecentEventId: "foo",
  };
  const newRoom = {};
  matrix.GenericMatrixConversation.replaceRoom.call(roomStub, newRoom);
  strictEqual(roomStub._replacedBy, newRoom);
  ok(roomStub.initialized);
  equal(newRoom._mostRecentEventId, roomStub._mostRecentEventId);
});

add_task(async function test_waitForRoom() {
  const roomStub = {
    _initialized: Promise.resolve(),
  };
  const awaitedRoom = await matrix.GenericMatrixConversation.waitForRoom.call(
    roomStub
  );
  strictEqual(awaitedRoom, roomStub);
});

add_task(async function test_waitForRoomReplaced() {
  const roomStub = {};
  matrix.GenericMatrixConversation.sharedInit.call(roomStub);
  const newRoom = {
    waitForRoom() {
      return Promise.resolve("success");
    },
  };
  matrix.GenericMatrixConversation.replaceRoom.call(roomStub, newRoom);
  const awaitedRoom = await matrix.GenericMatrixConversation.waitForRoom.call(
    roomStub
  );
  equal(awaitedRoom, "success");
});

add_task(function test_conversationInheritance() {
  testInheritance(matrix.MatrixConversation);
  testInheritance(matrix.MatrixDirectConversation);
});

function testInheritance(targetConstructor) {
  for (const [key, value] of Object.entries(matrix.GenericMatrixConversation)) {
    ok(targetConstructor.prototype.hasOwnProperty(key));
    strictEqual(targetConstructor.prototype[key], value);
  }
}

add_task(function test_addEventRedacted() {
  const event = makeEvent("@user:example.com", {}, true);
  const roomStub = {};
  matrix.GenericMatrixConversation.addEvent.call(roomStub, event);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventMessageIncoming() {
  const event = makeEvent("@user:example.com", {
    body: "foo",
    msgtype: "m.text",
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
    },
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  matrix.GenericMatrixConversation.addEvent.call(roomStub, event);
  equal(roomStub.who, "@user:example.com");
  equal(roomStub.message, "foo");
  ok(roomStub.options.incoming);
  ok(!roomStub.options.outgoing);
  ok(!roomStub.options.system);
  equal(roomStub.options.time, Math.floor(event.getDate().getTime() / 1000));
  equal(roomStub.options._alias, "foo bar");
  ok(!roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventMessageOutgoing() {
  const event = makeEvent("@test:example.com", {
    body: "foo",
    msgtype: "m.text",
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
    },
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  matrix.GenericMatrixConversation.addEvent.call(roomStub, event);
  equal(roomStub.who, "@test:example.com");
  equal(roomStub.message, "foo");
  ok(!roomStub.options.incoming);
  ok(roomStub.options.outgoing);
  ok(!roomStub.options.system);
  equal(roomStub.options.time, Math.floor(event.getDate().getTime() / 1000));
  equal(roomStub.options._alias, "foo bar");
  ok(!roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventMessageEmote() {
  const event = makeEvent("@user:example.com", {
    body: "foo",
    msgtype: "m.emote",
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
    },
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  matrix.GenericMatrixConversation.addEvent.call(roomStub, event);
  equal(roomStub.who, "@user:example.com");
  equal(roomStub.message, "/me foo");
  ok(roomStub.options.incoming);
  ok(!roomStub.options.outgoing);
  ok(!roomStub.options.system);
  equal(roomStub.options.time, Math.floor(event.getDate().getTime() / 1000));
  equal(roomStub.options._alias, "foo bar");
  ok(!roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventMessageDelayed() {
  const event = makeEvent("@user:example.com", {
    body: "foo",
    msgtype: "m.text",
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
    },
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  matrix.GenericMatrixConversation.addEvent.call(roomStub, event, true);
  equal(roomStub.who, "@user:example.com");
  equal(roomStub.message, "foo");
  ok(roomStub.options.incoming);
  ok(!roomStub.options.outgoing);
  ok(!roomStub.options.system);
  equal(roomStub.options.time, Math.floor(event.getDate().getTime() / 1000));
  equal(roomStub.options._alias, "foo bar");
  ok(roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventTopic() {
  const event = {
    isRedacted() {
      return false;
    },
    getType() {
      return "m.room.topic";
    },
    getId() {
      return 1;
    },
    getContent() {
      return {
        topic: "foo bar",
      };
    },
    getSender() {
      return "@user:example.com";
    },
  };
  const roomStub = {
    setTopic(topic, who) {
      this.who = who;
      this.topic = topic;
    },
  };
  matrix.GenericMatrixConversation.addEvent.call(roomStub, event);
  equal(roomStub.who, "@user:example.com");
  equal(roomStub.topic, "foo bar");
  equal(roomStub._mostRecentEventId, 1);
});

function makeEvent(sender, content = {}, redacted = false) {
  const time = new Date();
  return {
    isRedacted() {
      return redacted;
    },
    getType() {
      return "m.room.message";
    },
    getSender() {
      return sender;
    },
    getContent() {
      return content;
    },
    getDate() {
      return time;
    },
    sender: {
      name: "foo bar",
    },
    getId() {
      return 0;
    },
  };
}

add_task(function test_forgetWith_close() {
  const roomList = new Map();
  const roomStub = {
    _close() {
      this.closeCalled = true;
    },
    _roomId: "foo",
    _account: {
      roomList,
    },
    // stubs for jsProtoHelper implementations
    addObserver() {},
    unInit() {},
  };
  roomList.set(roomStub._roomId, roomStub);
  Services.conversations.addConversation(roomStub);

  matrix.GenericMatrixConversation.forget.call(roomStub);
  ok(!roomList.has(roomStub._roomId));
  ok(roomStub.closeCalled);
});

add_task(function test_forgetWithout_close() {
  const roomList = new Map();
  const roomStub = {
    _roomId: "foo",
    _account: {
      roomList,
    },
    // stubs for jsProtoHelper implementations
    addObserver() {},
    unInit() {},
  };
  roomList.set(roomStub._roomId, roomStub);
  Services.conversations.addConversation(roomStub);

  matrix.GenericMatrixConversation.forget.call(roomStub);
  ok(!roomList.has(roomStub._roomId));
});

add_task(function test_close() {
  const roomStub = {
    forget() {
      this.forgetCalled = true;
    },
    _roomId: "foo",
    _account: {
      _client: {
        leave(roomId) {
          roomStub.leftRoom = roomId;
        },
      },
    },
  };

  matrix.GenericMatrixConversation.close.call(roomStub);
  equal(roomStub.leftRoom, roomStub._roomId);
  ok(roomStub.forgetCalled);
});
