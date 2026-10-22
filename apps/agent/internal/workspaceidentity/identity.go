// Package workspaceidentity identifies an existing directory across process restarts.
package workspaceidentity

import (
	"errors"
	"os"
)

func Read(path string) (string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", errors.New("workspace must be a directory")
	}
	return readID(path, info)
}
