//go:build !windows

package config

// POSIX rename replaces a file that other processes have open.
func renameBlocked(error) bool { return false }
