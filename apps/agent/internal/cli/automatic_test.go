package cli

import "context"

// Ordinary CLI unit tests must never inspect or register the developer's real
// coding clients. The hook and entry-point routing have dedicated tests.
func init() {
	startClientIntegrations = func(context.Context, string, func(string, string)) context.CancelFunc { return func() {} }
}
