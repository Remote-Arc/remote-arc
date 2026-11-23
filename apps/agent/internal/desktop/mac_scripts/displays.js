// Prints the displays in points, top left of the main display at 0,0, as
// CoreGraphics events and screencapture -R use. AppKit's origin is the
// bottom left of the main display, so y is flipped.
ObjC.import("AppKit");

function run() {
  var screens = $.NSScreen.screens;
  var out = [];
  if (screens.count === 0) return "[]";
  var height = screens.objectAtIndex(0).frame.size.height;
  for (var i = 0; i < screens.count; i++) {
    var frame = screens.objectAtIndex(i).frame;
    out.push({
      x: frame.origin.x,
      y: height - frame.origin.y - frame.size.height,
      width: frame.size.width,
      height: frame.size.height,
      main: i === 0,
    });
  }
  return JSON.stringify(out);
}
