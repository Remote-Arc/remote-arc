// Prints the on-screen windows front to back, and which belong to the
// frontmost app. Window titles need the Screen Recording permission.
ObjC.import("CoreGraphics");
ObjC.import("AppKit");

var ON_SCREEN_ONLY = 1;
var EXCLUDE_DESKTOP = 16;

function run() {
  var info = $.CGWindowListCopyWindowInfo(ON_SCREEN_ONLY | EXCLUDE_DESKTOP, 0);
  var list = ObjC.deepUnwrap(ObjC.castRefToObject(info)) || [];
  var front = $.NSWorkspace.sharedWorkspace.frontmostApplication;
  var pid = front ? front.processIdentifier : -1;
  return JSON.stringify(
    list.map(function (w) {
      var bounds = w.kCGWindowBounds || {};
      return {
        number: w.kCGWindowNumber,
        owner: w.kCGWindowOwnerName || "",
        pid: w.kCGWindowOwnerPID,
        name: w.kCGWindowName || "",
        layer: w.kCGWindowLayer,
        alpha: w.kCGWindowAlpha === undefined ? 1 : w.kCGWindowAlpha,
        x: bounds.X || 0,
        y: bounds.Y || 0,
        width: bounds.Width || 0,
        height: bounds.Height || 0,
        foreground: w.kCGWindowOwnerPID === pid,
      };
    }),
  );
}
