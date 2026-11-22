// Package onboarding inspects local client executable locations without
// executing clients or opening their configuration or private sessions.
package onboarding

import (
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

const Contract = "remotearc.local-setup-inspection/v1"

type Candidate struct {
	Path   string `json:"path"`
	Source string `json:"source"`
}

type Client struct {
	Agent         string      `json:"agent"`
	Status        string      `json:"status"`
	Candidates    []Candidate `json:"candidates"`
	Version       string      `json:"version_status"`
	Compatibility string      `json:"compatibility"`
	Integration   string      `json:"integration_status"`
	Warnings      []string    `json:"warnings"`
}

type Inspection struct {
	Contract       string   `json:"contract"`
	RuntimeVersion string   `json:"runtime_version"`
	Platform       string   `json:"platform"`
	Mode           string   `json:"mode"`
	Clients        []Client `json:"clients"`
}

type detector struct {
	platform string
	home     string
	env      func(string) string
	lookup   func(string) (string, error)
}

func Inspect(ctx context.Context, agent, version string) (Inspection, error) {
	home, _ := os.UserHomeDir()
	d := detector{runtime.GOOS, home, os.Getenv, exec.LookPath}
	return d.inspect(ctx, agent, version)
}

func (d detector) inspect(ctx context.Context, agent, version string) (Inspection, error) {
	r := Inspection{Contract: Contract, RuntimeVersion: version, Platform: d.platform, Mode: "local-only", Clients: []Client{}}
	if agent != "all" && agent != "codex" && agent != "claude" {
		return r, errors.New("--agent must be codex, claude or all")
	}
	for _, name := range []string{"codex", "claude"} {
		if ctx.Err() != nil {
			return r, ctx.Err()
		}
		if agent != "all" && agent != name {
			continue
		}
		c := Client{Agent: name, Status: "not_found", Candidates: []Candidate{}, Version: "not_checked", Compatibility: "unqualified", Integration: "not_inspected", Warnings: []string{}}
		seen := map[string]bool{}
		add := func(path, source string) {
			// A name/path is an executable candidate, never proof of its vendor,
			// supported version or configured integrations. Do not run it.
			if !filepath.IsAbs(path) {
				return
			}
			info, err := os.Stat(path)
			if err != nil || !info.Mode().IsRegular() || (d.platform != "windows" && info.Mode().Perm()&0111 == 0) {
				return
			}
			key := filepath.Clean(path)
			if d.platform == "windows" {
				key = strings.ToLower(key)
			}
			if !seen[key] {
				seen[key] = true
				c.Candidates = append(c.Candidates, Candidate{path, source})
				c.Status = "candidate_found"
			}
		}
		if path, err := d.lookup(name); err == nil {
			add(path, "path")
		} else if !errors.Is(err, exec.ErrNotFound) {
			c.Warnings = append(c.Warnings, "path_lookup_rejected")
		}
		for _, path := range d.knownPaths(name) {
			add(path, "known_location")
		}
		if name == "codex" && d.platform == "windows" {
			base := d.env("LOCALAPPDATA")
			if filepath.IsAbs(base) {
				// Desktop builds use versioned bin directories. Inspect only one
				// named directory, with a fixed entry cap; never walk the home.
				root := filepath.Join(base, "OpenAI", "Codex", "bin")
				f, err := os.Open(root)
				if err == nil {
					entries, readErr := f.ReadDir(33)
					f.Close()
					if len(entries) > 32 {
						entries = entries[:32]
						c.Warnings = append(c.Warnings, "desktop_scan_limit_reached")
					}
					if readErr != nil && !errors.Is(readErr, io.EOF) {
						c.Warnings = append(c.Warnings, "desktop_scan_unavailable")
					}
					for _, entry := range entries {
						if entry.IsDir() && entry.Type()&os.ModeSymlink == 0 {
							add(filepath.Join(root, entry.Name(), "codex.exe"), "desktop_bin")
						}
					}
				} else if !errors.Is(err, os.ErrNotExist) {
					c.Warnings = append(c.Warnings, "desktop_scan_unavailable")
				}
			}
		}
		if d.platform == "windows" {
			// Resolve only fixed native package locations beside a discovered
			// npm shim. Never read/evaluate the shell wrapper or run Node.
			for _, candidate := range append([]Candidate(nil), c.Candidates...) {
				for _, native := range npmNativeCandidates(name, candidate.Path, runtime.GOARCH) {
					add(native.Path, native.Source)
				}
			}
		}
		// Keep output stable across filesystem enumeration order.
		sort.Slice(c.Candidates, func(i, j int) bool { return c.Candidates[i].Path < c.Candidates[j].Path })
		r.Clients = append(r.Clients, c)
	}
	return r, ctx.Err()
}

func npmNativeCandidates(agent, shim, arch string) []Candidate {
	if !filepath.IsAbs(shim) || !strings.EqualFold(filepath.Base(shim), agent+".cmd") {
		return nil
	}
	cpu, triple := "", ""
	switch arch {
	case "amd64":
		cpu, triple = "x64", "x86_64-pc-windows-msvc"
	case "arm64":
		cpu, triple = "arm64", "aarch64-pc-windows-msvc"
	default:
		return nil
	}
	modules := filepath.Join(filepath.Dir(shim), "node_modules")
	if strings.EqualFold(filepath.Base(filepath.Dir(shim)), ".bin") {
		modules = filepath.Dir(filepath.Dir(shim))
	}
	switch agent {
	case "codex":
		paths := []Candidate{}
		for _, root := range []string{modules, filepath.Join(modules, "@openai", "codex", "node_modules")} {
			for _, binDir := range []string{"bin", "codex"} {
				paths = append(paths, Candidate{filepath.Join(root, "@openai", "codex-win32-"+cpu, "vendor", triple, binDir, "codex.exe"), "npm_native"})
			}
		}
		for _, binDir := range []string{"bin", "codex"} {
			paths = append(paths, Candidate{filepath.Join(modules, "@openai", "codex", "vendor", triple, binDir, "codex.exe"), "npm_bundled"})
		}
		return paths
	case "claude":
		return []Candidate{
			{filepath.Join(modules, "@anthropic-ai", "claude-code-win32-"+cpu, "claude.exe"), "npm_native"},
			{filepath.Join(modules, "@anthropic-ai", "claude-code", "node_modules", "@anthropic-ai", "claude-code-win32-"+cpu, "claude.exe"), "npm_native"},
			{filepath.Join(modules, "@anthropic-ai", "claude-code", "bin", "claude.exe"), "npm_bundled"},
		}
	}
	return nil
}

func (d detector) knownPaths(name string) []string {
	var paths []string
	if filepath.IsAbs(d.home) {
		binary := name
		if d.platform == "windows" {
			binary += ".exe"
		}
		paths = append(paths, filepath.Join(d.home, ".local", "bin", binary))
		if d.platform == "darwin" && name == "codex" {
			for _, app := range []string{"Codex.app", "ChatGPT.app"} {
				paths = append(paths, filepath.Join(d.home, "Applications", app, "Contents", "Resources", "codex"))
			}
		}
	}
	if d.platform == "darwin" && name == "codex" {
		for _, app := range []string{"Codex.app", "ChatGPT.app"} {
			paths = append(paths, filepath.Join("/Applications", app, "Contents", "Resources", "codex"))
		}
	}
	if d.platform == "windows" {
		if base := d.env("APPDATA"); filepath.IsAbs(base) {
			paths = append(paths, filepath.Join(base, "npm", name+".cmd"))
		}
	}
	return paths
}
