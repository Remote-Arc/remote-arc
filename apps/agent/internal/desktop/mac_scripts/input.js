// Sends one batch of input operations through CoreGraphics. argv[0] is the
// JSON operations, argv[1] where the previous batch left the pointer (or "").
// Before each operation the pointer is compared with where this action put
// it: if the person moved it, the batch stops so the person always wins.
// Prints {done, moved, x, y}.
ObjC.import("CoreGraphics");
ObjC.import("AppKit");

var HID_TAP = 0;
var MOVED = 5;
var CLICK_STATE = 1;
var LINE_UNITS = 1;
var DOWN = { left: 1, right: 3, middle: 25 };
var UP = { left: 2, right: 4, middle: 26 };
var DRAG = { left: 6, right: 7, middle: 27 };
var NUMBER = { left: 0, right: 1, middle: 2 };

function wait(ms) {
  $.NSThread.sleepForTimeInterval(ms / 1000);
}

function where() {
  var at = $.CGEventGetLocation($.CGEventCreate(null));
  return { x: Math.round(at.x), y: Math.round(at.y) };
}

function near(a, b) {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}

// A posted move reaches the pointer shortly after; wait for it so it is not
// mistaken for the person moving the mouse.
function settle(target) {
  for (var i = 0; i < 10 && !near(where(), target); i++) wait(10);
}

function post(event, flags) {
  if (flags) $.CGEventSetFlags(event, flags);
  $.CGEventPost(HID_TAP, event);
}

function mouse(type, op) {
  var event = $.CGEventCreateMouseEvent(
    null,
    type,
    { x: op.x, y: op.y },
    NUMBER[op.button || "left"],
  );
  if (op.clicks) $.CGEventSetIntegerValueField(event, CLICK_STATE, op.clicks);
  post(event, op.flags);
}

function key(code, flags) {
  post($.CGEventCreateKeyboardEvent(null, code, true), flags);
  post($.CGEventCreateKeyboardEvent(null, code, false), flags);
}

// Text is pasted: the clipboard gets the text, Command-V is pressed, and the
// clipboard is then put back with every item and type it held. Key events do
// not work for text on a Mac: CGEventKeyboardSetUnicodeString needs a UniChar
// buffer the JavaScript bridge cannot pass (each event typed only "a"), and an
// input method such as Chinese Pinyin swallows synthetic key events. Clipboard
// managers can record the pasted text.
var V = 9;
var COMMAND = 0x100000;
var PASTE_SETTLE_MS = 250;

function clipboardItems(board) {
  var items = [];
  var current = board.pasteboardItems;
  for (var i = 0; current && i < current.count; i++) {
    var item = current.objectAtIndex(i);
    var copy = $.NSPasteboardItem.alloc.init;
    var types = item.types;
    for (var j = 0; j < types.count; j++) {
      var type = types.objectAtIndex(j);
      var data = item.dataForType(type);
      if (data && !data.isNil()) copy.setDataForType(data, type);
    }
    items.push(copy);
  }
  return items;
}

function type(text) {
  var board = $.NSPasteboard.generalPasteboard;
  var saved = clipboardItems(board);
  board.clearContents;
  board.setStringForType($(text), $.NSPasteboardTypeString);
  key(V, COMMAND);
  // The app reads the clipboard when it handles Command-V; wait before restoring.
  wait(PASTE_SETTLE_MS);
  board.clearContents;
  if (saved.length) board.writeObjects($(saved));
}

function run(argv) {
  var ops = JSON.parse(argv[0]);
  var placed = argv[1] ? JSON.parse(argv[1]) : null;
  var done = 0;
  for (var i = 0; i < ops.length; i++) {
    if (placed && !near(where(), placed)) {
      return JSON.stringify({ done: done, moved: true });
    }
    var op = ops[i];
    switch (op.op) {
      case "move":
        mouse(op.button ? DRAG[op.button] : MOVED, op);
        placed = { x: op.x, y: op.y };
        settle(placed);
        break;
      case "down":
        mouse(DOWN[op.button], op);
        wait(8);
        break;
      case "up":
        mouse(UP[op.button], op);
        wait(8);
        break;
      case "wheel":
        // Positive wheel1 scrolls up and positive wheel2 scrolls left.
        post(
          $.CGEventCreateScrollWheelEvent2(null, LINE_UNITS, 2, op.dy || 0, -(op.dx || 0), 0),
          0,
        );
        wait(8);
        break;
      case "key":
        key(op.code, op.flags || 0);
        wait(8);
        break;
      case "text":
        type(op.text);
        break;
      case "pause":
        wait(op.ms || 0);
        break;
      default:
        throw new Error("unknown operation " + op.op);
    }
    done++;
  }
  return JSON.stringify({
    done: done,
    moved: false,
    x: placed ? placed.x : 0,
    y: placed ? placed.y : 0,
    placed: !!placed,
  });
}
