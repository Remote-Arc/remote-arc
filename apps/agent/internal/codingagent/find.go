package codingagent

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
)

// findAgent returns the program to start for a coding agent. A background
// Agent often runs with a shorter PATH than the person's terminal (systemd
// user units, launchd, the Windows Run key), so after PATH it looks in the
// folders the agents' own installers and npm use. Unfound, it returns the name
// itself, and starting it reports that the agent is not installed.
func findAgent(name string) string {
	if path, err := exec.LookPath(name); err == nil {
		return path
	}
	for _, path := range agentCandidates(name) {
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path
		}
	}
	return name
}

func agentCandidates(name string) []string {
	home, _ := os.UserHomeDir()
	if runtime.GOOS == "windows" {
		appData := os.Getenv("APPDATA")
		return []string{
			filepath.Join(home, ".local", "bin", name+".exe"),
			filepath.Join(appData, "npm", name+".cmd"),
			filepath.Join(home, "AppData", "Roaming", "npm", name+".cmd"),
		}
	}
	paths := []string{
		filepath.Join(home, ".local", "bin", name),
		filepath.Join(home, ".claude", "local", name),
		filepath.Join(home, ".npm-global", "bin", name),
		filepath.Join(home, ".bun", "bin", name),
		filepath.Join("/opt/homebrew/bin", name),
		filepath.Join("/usr/local/bin", name),
	}
	// Node versions installed with nvm, newest name first.
	versions, _ := filepath.Glob(filepath.Join(home, ".nvm", "versions", "node", "*", "bin", name))
	sort.Sort(sort.Reverse(sort.StringSlice(versions)))
	return append(paths, versions...)
}
