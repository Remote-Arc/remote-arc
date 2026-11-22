//go:build !linux && !darwin && !windows

package machineid

func readRaw() string { return "" }
