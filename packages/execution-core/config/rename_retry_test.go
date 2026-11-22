package config

import (
	"errors"
	"testing"
	"time"
)

func TestRetryRename(t *testing.T) {
	blocked := errors.New("blocked")
	isBlocked := func(e error) bool { return errors.Is(e, blocked) }
	attempt := func(failures int, failure error) (int, []time.Duration, error) {
		calls := 0
		var waits []time.Duration
		e := retryRename(func(string, string) error {
			calls++
			if calls <= failures {
				return failure
			}
			return nil
		}, isBlocked, func(d time.Duration) { waits = append(waits, d) }, "from", "to")
		return calls, waits, e
	}
	if calls, waits, e := attempt(0, nil); e != nil || calls != 1 || len(waits) != 0 {
		t.Fatalf("clear path: calls=%d waits=%v err=%v", calls, waits, e)
	}
	if calls, waits, e := attempt(2, blocked); e != nil || calls != 3 || len(waits) != 2 || waits[1] != 2*waits[0] {
		t.Fatalf("brief reader: calls=%d waits=%v err=%v", calls, waits, e)
	}
	if calls, waits, e := attempt(100, blocked); !errors.Is(e, blocked) || calls != 8 {
		t.Fatalf("stuck reader must give up: calls=%d waits=%v err=%v", calls, waits, e)
	} else {
		total := time.Duration(0)
		for _, wait := range waits {
			total += wait
		}
		if total > 2*time.Second {
			t.Fatalf("waited %v; Agent startup must not stall", total)
		}
	}
	other := errors.New("disk full")
	if calls, waits, e := attempt(100, other); !errors.Is(e, other) || calls != 1 || len(waits) != 0 {
		t.Fatalf("other failures are immediate: calls=%d waits=%v err=%v", calls, waits, e)
	}
}

func TestRetryReadFile(t *testing.T) {
	blocked := errors.New("blocked")
	isBlocked := func(e error) bool { return errors.Is(e, blocked) }
	attempt := func(failures int, failure error) (int, []time.Duration, []byte, error) {
		calls := 0
		var waits []time.Duration
		b, e := retryReadFile(func(string) ([]byte, error) {
			calls++
			if calls <= failures {
				return nil, failure
			}
			return []byte("data"), nil
		}, isBlocked, func(d time.Duration) { waits = append(waits, d) }, "path")
		return calls, waits, b, e
	}
	if calls, waits, b, e := attempt(0, nil); e != nil || calls != 1 || len(waits) != 0 || string(b) != "data" {
		t.Fatalf("clear path: calls=%d waits=%v b=%q err=%v", calls, waits, b, e)
	}
	if calls, waits, b, e := attempt(2, blocked); e != nil || calls != 3 || len(waits) != 2 || string(b) != "data" {
		t.Fatalf("brief writer: calls=%d waits=%v b=%q err=%v", calls, waits, b, e)
	}
	if calls, waits, _, e := attempt(100, blocked); !errors.Is(e, blocked) || calls != 8 {
		t.Fatalf("stuck writer must give up: calls=%d waits=%v err=%v", calls, waits, e)
	}
	other := errors.New("not found")
	if calls, waits, _, e := attempt(100, other); !errors.Is(e, other) || calls != 1 || len(waits) != 0 {
		t.Fatalf("other failures are immediate: calls=%d waits=%v err=%v", calls, waits, e)
	}
}
