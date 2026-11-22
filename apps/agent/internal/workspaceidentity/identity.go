// Package workspaceidentity identifies existing filesystem objects across restarts.
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

// ReadFile identifies a regular file without accepting a final symlink. Callers
// must also verify their opened handle and any required parent-path boundaries.
func ReadFile(path string) (string, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", errors.New("source must be a regular file")
	}
	return readID(path, info)
}
