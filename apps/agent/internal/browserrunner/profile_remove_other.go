//go:build !windows

package browserrunner

import (
	"context"
	"os"
)

func removeBrowserProfile(ctx context.Context, path string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return os.RemoveAll(path)
}
