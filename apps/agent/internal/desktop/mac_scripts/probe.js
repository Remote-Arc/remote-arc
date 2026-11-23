// Prints whether macOS lets the Agent see the screen (Screen Recording) and
// send input (Accessibility). With "ask", a missing permission is requested,
// which lists the Agent in System Settings for the person to turn on.
ObjC.import("CoreGraphics");
ObjC.import("ApplicationServices");
// The screen-capture checks (macOS 10.15+) are missing from the bridge's
// CoreGraphics metadata, so $ has no such functions until they are bound.
ObjC.bindFunction("CGPreflightScreenCaptureAccess", ["bool", []]);
ObjC.bindFunction("CGRequestScreenCaptureAccess", ["bool", []]);

function run(argv) {
  var screen = !!$.CGPreflightScreenCaptureAccess();
  var input = !!$.AXIsProcessTrusted();
  if (argv[0] === "ask") {
    if (!screen) $.CGRequestScreenCaptureAccess();
    if (!input) $.AXIsProcessTrustedWithOptions($({ AXTrustedCheckOptionPrompt: true }));
  }
  return JSON.stringify({ screen: screen, input: input });
}
