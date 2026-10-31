//go:build darwin

package browserrunner

import "testing"

func TestMacConsolePresenceRequiresOurUnlockedConsole(t *testing.T) {
	for _, test := range []struct {
		name, data string
		want       bool
	}{
		{"unlocked", `"IOConsoleUsers" = ({"kCGSSessionUserIDKey"=501,"kCGSSessionOnConsoleKey"=Yes,"kCGSessionLoginDoneKey"=Yes,"CGSSessionScreenIsLocked"=No})`, true},
		{"locked", `"IOConsoleUsers" = ({"kCGSSessionUserIDKey"=501,"kCGSSessionOnConsoleKey"=Yes,"kCGSessionLoginDoneKey"=Yes,"CGSSessionScreenIsLocked"=Yes})`, false},
		{"other console user", `"IOConsoleUsers" = ({"kCGSSessionUserIDKey"=502,"kCGSSessionOnConsoleKey"=Yes,"kCGSessionLoginDoneKey"=Yes},{"kCGSSessionUserIDKey"=501,"kCGSSessionOnConsoleKey"=No,"kCGSessionLoginDoneKey"=Yes})`, false},
		{"unknown", `"IOConsoleUsers" = ()`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := macConsolePresent([]byte(test.data), 501); got != test.want {
				t.Fatalf("presence=%v want %v", got, test.want)
			}
		})
	}
}
