// Prints the pointer position in points, top left of the main display at 0,0.
ObjC.import("CoreGraphics");

function run() {
  var at = $.CGEventGetLocation($.CGEventCreate(null));
  return JSON.stringify({ x: Math.round(at.x), y: Math.round(at.y) });
}
