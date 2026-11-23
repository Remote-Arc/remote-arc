package cli

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/service"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

// TestMain keeps every CLI test away from the host's real service manager.
// Background is on by default, so a launch would otherwise install a real
// launchd, systemd or Windows login service on the machine running the tests.
func TestMain(m *testing.M) {
	newBackground = func(version string) *service.Controller {
		return &service.Controller{
			Home: config.Home(), Platform: "test-no-service-manager", Version: version,
			Wait: func(time.Duration) {},
			Run:  func(context.Context, string, ...string) (string, error) { return "", nil },
		}
	}
	os.Exit(m.Run())
}
