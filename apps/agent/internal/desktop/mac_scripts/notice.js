// Shows the notice that AI is using this computer, at the top of the main
// display, above full-screen apps and on every Space. It ignores the mouse
// and is left out of screen captures. argv[0] is a state file the Agent
// rewrites every second with "show <ms>" or "hide <ms>": the notice hides
// when the state is old and quits when it is older still or gone, so it
// never outlives the Agent.
ObjC.import("Cocoa");

var HIDE_AFTER_MS = 3000;
var QUIT_AFTER_MS = 30000;

function run(argv) {
  var stateFile = argv[0];
  var app = $.NSApplication.sharedApplication;
  app.setActivationPolicy(1); // accessory: no Dock icon, no menu bar

  var screen = $.NSScreen.screens.objectAtIndex(0).frame;
  var width = Math.round(screen.size.width * 0.4);
  var height = 50;
  var rect = $.NSMakeRect(
    screen.origin.x + (screen.size.width - width) / 2,
    screen.origin.y + screen.size.height - height - 40,
    width,
    height,
  );
  var win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(rect, 0, 2, false);
  win.setLevel(1000); // screen-saver level, above full-screen apps
  win.setIgnoresMouseEvents(true);
  win.setHasShadow(true);
  win.setSharingType(0); // NSWindowSharingNone: not in screen captures
  win.setCollectionBehavior(1 | 16 | 256); // all Spaces, stationary, full-screen auxiliary
  win.setBackgroundColor($.NSColor.colorWithSRGBRedGreenBlueAlpha(0.98, 0.75, 0.14, 0.97));

  var dot = $.NSTextField.labelWithString("●");
  dot.setFont($.NSFont.boldSystemFontOfSize(16));
  dot.setTextColor($.NSColor.colorWithSRGBRedGreenBlueAlpha(0.85, 0.1, 0.1, 1));
  dot.setFrame($.NSMakeRect(16, (height - 22) / 2, 20, 22));
  win.contentView.addSubview(dot);

  var label = $.NSTextField.labelWithString(
    "Remote Arc: AI is using this computer. Move the mouse to take over.",
  );
  label.setFont($.NSFont.boldSystemFontOfSize(13));
  label.setTextColor($.NSColor.blackColor);
  label.setAlignment(2); // centred
  label.setFrame($.NSMakeRect(40, (height - 18) / 2, width - 56, 18));
  win.contentView.addSubview(label);

  // A plain loop rather than an NSTimer with an ObjC.registerSubclass target:
  // on macOS 15, registering a subclass from JavaScript never returns, so the
  // notice would neither show nor quit. Letting the run loop work for 50 ms
  // at a time keeps the window drawn and the state checked.
  app.finishLaunching;
  for (;;) {
    var text = $.NSString.stringWithContentsOfFileEncodingError(stateFile, 4, null);
    var parts = text && !text.isNil() ? ObjC.unwrap(text).trim().split(" ") : [];
    var age = parts.length === 2 ? Date.now() - Number(parts[1]) : Infinity;
    if (!(age < QUIT_AFTER_MS)) return "";
    var visible = parts[0] === "show" && age < HIDE_AFTER_MS;
    if (visible && !win.isVisible) win.orderFrontRegardless;
    if (!visible && win.isVisible) win.orderOut(null);
    $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.05));
  }
}
