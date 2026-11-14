package machineid

var linuxIDPaths = []string{"/etc/machine-id", "/var/lib/dbus/machine-id"}

func readRaw() string { return firstReadable(linuxIDPaths) }
