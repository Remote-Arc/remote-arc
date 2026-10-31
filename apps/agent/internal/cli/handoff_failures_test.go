package cli

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

func TestUpgradeFailureAndCancellationRestoreRecoveryWithoutTakingOwnership(t *testing.T) {
	t.Run("unavailable control", func(t *testing.T) {
		dir, bg, log, _ := handoffFixture(t)
		if err := handOffOlderGoAgent(context.Background(), dir, bg, log, "0.6.4", "0.6.5"); err == nil || !strings.Contains(err.Error(), "Could not ask") {
			t.Fatal(err)
		}
		cfg, err := config.Load()
		if err != nil || cfg.BackgroundEnabled == nil || !*cfg.BackgroundEnabled || cfg.DeviceToken != "private" {
			t.Fatal("failed handoff lost recovery/pairing", err)
		}
		if err = config.Reset(); err != nil {
			t.Fatal(err)
		}
		if err = handOffOlderGoAgent(context.Background(), dir, bg, log, "0.6.4", "0.6.5"); err == nil {
			t.Fatal("handoff without pairing accepted")
		}
	})
	t.Run("cancelled drain", func(t *testing.T) {
		dir, bg, log, _ := handoffFixture(t)
		old := startOldAgent(t, "0.6.4", false)
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		done := make(chan error, 1)
		go func() { done <- handOffOlderGoAgent(ctx, dir, bg, log, "0.6.4", "0.6.5") }()
		deadline := time.After(3 * time.Second)
		for {
			old.mu.Lock()
			stops := old.stops
			old.mu.Unlock()
			if stops == 1 {
				break
			}
			select {
			case <-deadline:
				cancel()
				<-done
				t.Fatal("old owner was not asked to drain")
			case <-time.After(10 * time.Millisecond):
			}
		}
		cancel()
		select {
		case err := <-done:
			if !errors.Is(err, context.Canceled) {
				t.Fatal(err)
			}
		case <-time.After(time.Second):
			t.Fatal("handoff ignored cancellation")
		}
		cfg, err := config.Load()
		if err != nil || !*cfg.BackgroundEnabled || !lease.Active(dir, "execution") {
			t.Fatal("cancelled handoff altered live ownership/recovery", err)
		}
	})
	if confirmReplace(nil, io.Discard, "replace?") {
		t.Fatal("noninteractive launch granted upgrade permission")
	}
	if !olderRelease("1.2.3-alpha", "1.2.3-beta") || olderRelease("1.2.3-rc..1", "1.2.4") {
		t.Fatal("invalid/lexical prerelease ordering")
	}
}

func TestOwnedStartupControlMetadataFailureReleasesLease(t *testing.T) {
	dir, bg, log, _ := handoffFixture(t)
	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	cfg.ExecutionPaused = false
	if err = config.Save(cfg); err != nil {
		t.Fatal(err)
	}
	owned, err := lease.Acquire(dir, "execution")
	if err != nil || owned == nil {
		t.Fatal(err)
	}
	if err = os.Mkdir(filepath.Join(dir, "control.json"), 0700); err != nil {
		t.Fatal(err)
	}
	if err = runOwned(context.Background(), Options{Foreground: true}, cfg, "test", owned, bg, log, nil, io.Discard, nil, os.Stdin); err == nil {
		t.Fatal("runtime started without durable authenticated control endpoint")
	}
	if lease.Active(dir, "execution") {
		t.Fatal("failed startup leaked execution lease")
	}
}
