package execution

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// fakeRelay stands in for the Relay's device transfer API.
type fakeRelay struct {
	mu        sync.Mutex
	info      TransferInfo
	staged    []byte
	parts     map[int][]byte
	completed string
	reports   []map[string]any
	// cutAfter makes the first download stop after this many bytes, like a dropped connection.
	cutAfter  int
	downloads []int64
}

type cutReader struct {
	r    io.Reader
	left int
}

func (c *cutReader) Read(p []byte) (int, error) {
	if c.left <= 0 {
		return 0, errors.New("connection reset")
	}
	if len(p) > c.left {
		p = p[:c.left]
	}
	n, e := c.r.Read(p)
	c.left -= n
	return n, e
}

func (f *fakeRelay) Info(context.Context, string) (TransferInfo, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.info, nil
}
func (f *fakeRelay) Download(_ context.Context, _ string, offset int64) (io.ReadCloser, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.downloads = append(f.downloads, offset)
	r := io.Reader(bytes.NewReader(f.staged[offset:]))
	if f.cutAfter > 0 {
		r, f.cutAfter = &cutReader{r: r, left: f.cutAfter}, 0
	}
	return io.NopCloser(r), nil
}
func (f *fakeRelay) UploadPart(_ context.Context, _ string, part int, body io.Reader, length int64) error {
	b, e := io.ReadAll(body)
	if e != nil {
		return e
	}
	if int64(len(b)) != length {
		return errors.New("short part")
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.parts == nil {
		f.parts = map[int][]byte{}
	}
	f.parts[part] = b
	return nil
}
func (f *fakeRelay) SourceComplete(_ context.Context, _ string, sum string, size int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.completed = sum
	return nil
}
func (f *fakeRelay) Report(_ context.Context, _ string, report map[string]any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reports = append(f.reports, report)
	return nil
}
func (f *fakeRelay) last(t *testing.T) map[string]any {
	t.Helper()
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.reports) != 1 {
		t.Fatalf("want one report, got %v", f.reports)
	}
	return f.reports[0]
}

func hexSum(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }

func fastTransfers(t *testing.T) {
	t.Helper()
	old := []time.Duration{transferPollMin, transferPollMax, transferRetryDelay}
	transferPollMin, transferPollMax, transferRetryDelay = time.Millisecond, 2*time.Millisecond, time.Millisecond
	t.Cleanup(func() { transferPollMin, transferPollMax, transferRetryDelay = old[0], old[1], old[2] })
}

func staged(data []byte) *fakeRelay {
	return &fakeRelay{staged: data, info: TransferInfo{ID: "transfer-1", Status: "staged", Size: int64(len(data)), SHA256: hexSum(data), ExpiresAt: time.Now().Add(time.Hour).Format(time.RFC3339Nano)}}
}

func receiveArgs(path string, data []byte) map[string]any {
	return map[string]any{"transfer_id": "transfer-1", "path": path, "size": float64(len(data)), "sha256": hexSum(data)}
}

func TestTransferToolsNeedAClient(t *testing.T) {
	c := New("full")
	defer c.Close()
	for _, d := range c.ListTools() {
		if transferTools[d.Name] {
			t.Fatalf("%s listed without a transfer client", d.Name)
		}
	}
	c.Transfers = &fakeRelay{}
	names := map[string]bool{}
	for _, d := range c.ListTools() {
		names[d.Name] = true
	}
	if !names["receive_file"] || !names["send_file"] {
		t.Fatal("transfer tools are not listed with a client")
	}
	safe := New("safe")
	defer safe.Close()
	safe.Transfers = &fakeRelay{}
	if _, e := safe.Call(context.Background(), "receive_file", receiveArgs(filepath.Join(t.TempDir(), "x"), []byte("x")), protocol.Policy{}); e == nil || !strings.Contains(e.Error(), "permission mode") {
		t.Fatalf("safe mode accepted receive_file: %v", e)
	}
}

func TestReceiveFileVerifiesResumesAndCanBeUndone(t *testing.T) {
	fastTransfers(t)
	dir := t.TempDir()
	t.Setenv("REMOTEARC_HOME", dir)
	root := filepath.Join(dir, "films")
	data := bytes.Repeat([]byte("frame-"), 200000) // 1.2 MB
	relay := staged(data)
	relay.cutAfter = 300000
	c := New("full")
	defer c.Close()
	c.Transfers = relay
	target := filepath.Join(root, "nested", "film.mp4")
	accepted := payload(t, call(t, c, "receive_file", receiveArgs(target, data), protocol.Policy{WorkspaceRoots: []string{root}}))
	if accepted["accepted"] != true {
		t.Fatalf("not accepted: %v", accepted)
	}
	c.WaitTransfers()
	report := relay.last(t)
	if report["status"] != "delivered" || report["sha256"] != hexSum(data) || report["undo_available"] != true {
		t.Fatalf("report %v", report)
	}
	got, _ := os.ReadFile(target)
	if !bytes.Equal(got, data) {
		t.Fatal("written bytes differ")
	}
	if len(relay.downloads) != 2 || relay.downloads[0] != 0 || relay.downloads[1] != 300000 {
		t.Fatalf("download did not resume from the received offset: %v", relay.downloads)
	}
	if _, e := os.Stat(partialPath(target, "transfer-1")); !errors.Is(e, os.ErrNotExist) {
		t.Fatal("partial file left behind")
	}
	undone := payload(t, call(t, c, "undo_last_change", map[string]any{}, protocol.Policy{WorkspaceRoots: []string{root}}))
	if undone["tool"] != "receive_file" {
		t.Fatalf("undo %v", undone)
	}
	if _, e := os.Stat(target); !errors.Is(e, os.ErrNotExist) {
		t.Fatal("undo kept the delivered file")
	}
}

func TestReceiveFileRefusesBadBytesAndOverwrites(t *testing.T) {
	fastTransfers(t)
	dir := t.TempDir()
	t.Setenv("REMOTEARC_HOME", dir)
	p := protocol.Policy{WorkspaceRoots: []string{dir}}
	data := []byte("the real bytes")

	// The staged bytes do not match the hash the AI declared: nothing is written.
	relay := staged([]byte("tampered bytes"))
	c := New("full")
	defer c.Close()
	c.Transfers = relay
	target := filepath.Join(dir, "a.bin")
	call(t, c, "receive_file", receiveArgs(target, data), p)
	c.WaitTransfers()
	if r := relay.last(t); r["status"] != "failed" || r["error_code"] != "TRANSFER_SHA256_MISMATCH" {
		t.Fatalf("report %v", r)
	}
	if _, e := os.Stat(target); !errors.Is(e, os.ErrNotExist) {
		t.Fatal("mismatched bytes were written")
	}

	// The hash matches the declared one but the bytes are corrupted in transit.
	relay = staged(data)
	relay.staged = []byte("the fake bytes")
	c.Transfers = relay
	call(t, c, "receive_file", receiveArgs(target, data), p)
	c.WaitTransfers()
	if r := relay.last(t); r["error_code"] != "TRANSFER_SHA256_MISMATCH" {
		t.Fatalf("report %v", r)
	}
	if _, e := os.Stat(target); !errors.Is(e, os.ErrNotExist) {
		t.Fatal("corrupted bytes were written")
	}

	// An existing file is never replaced without overwrite:true.
	os.WriteFile(target, []byte("keep me"), 0644)
	relay = staged(data)
	c.Transfers = relay
	if _, e := c.Call(context.Background(), "receive_file", receiveArgs(target, data), p); e == nil || !strings.HasPrefix(e.Error(), "FILE_EXISTS:") {
		t.Fatalf("existing file accepted: %v", e)
	}
	args := receiveArgs(target, data)
	args["overwrite"] = true
	call(t, c, "receive_file", args, p)
	c.WaitTransfers()
	if r := relay.last(t); r["status"] != "delivered" || r["undo_available"] != true {
		t.Fatalf("report %v", r)
	}
	call(t, c, "undo_last_change", map[string]any{}, p)
	if got, _ := os.ReadFile(target); string(got) != "keep me" {
		t.Fatalf("undo restored %q", got)
	}

	// Policy is checked before any job starts.
	if _, e := c.Call(context.Background(), "receive_file", receiveArgs(filepath.Join(t.TempDir(), "out.bin"), data), p); e == nil || !strings.Contains(e.Error(), "Trusted Write Locations") {
		t.Fatalf("write outside the roots accepted: %v", e)
	}
	for _, bad := range []map[string]any{
		{"transfer_id": "transfer-1", "path": filepath.Join(dir, "b"), "size": float64(0)},
		{"transfer_id": "../../x", "path": filepath.Join(dir, "b"), "size": float64(1)},
		{"transfer_id": "transfer-1", "path": filepath.Join(dir, "b"), "size": float64(1), "sha256": "nothex"},
	} {
		if _, e := c.Call(context.Background(), "receive_file", bad, p); e == nil {
			t.Fatalf("accepted %v", bad)
		}
	}
}

func TestReceiveFileStopsWhenTheRelayEndsTheTransfer(t *testing.T) {
	fastTransfers(t)
	dir := t.TempDir()
	t.Setenv("REMOTEARC_HOME", dir)
	relay := staged([]byte("x"))
	relay.info.Status = "awaiting_upload"
	c := New("full")
	defer c.Close()
	c.Transfers = relay
	target := filepath.Join(dir, "never.bin")
	call(t, c, "receive_file", receiveArgs(target, []byte("x")), protocol.Policy{WorkspaceRoots: []string{dir}})
	time.Sleep(10 * time.Millisecond)
	relay.mu.Lock()
	relay.info.Status = "failed"
	relay.mu.Unlock()
	c.WaitTransfers()
	if r := relay.last(t); r["status"] != "skipped" {
		t.Fatalf("report %v", r)
	}
	if _, e := os.Stat(target); !errors.Is(e, os.ErrNotExist) {
		t.Fatal("file written for an ended transfer")
	}
	if len(relay.downloads) != 0 {
		t.Fatal("downloaded an unfinished upload")
	}
}

// A copy between computers: one Core sends into staging, another receives it.
func TestSendFileThenReceiveIsByteIdentical(t *testing.T) {
	fastTransfers(t)
	dir := t.TempDir()
	t.Setenv("REMOTEARC_HOME", dir)
	data := make([]byte, 11*1024*1024+17)
	for i := range data {
		data[i] = byte(i * 31)
	}
	source := filepath.Join(dir, "render.mov")
	os.WriteFile(source, data, 0644)
	relay := &fakeRelay{}
	sender := New("safe")
	defer sender.Close()
	sender.Transfers = relay
	args := map[string]any{"transfer_id": "transfer-1", "path": source, "size": float64(len(data)), "part_size": float64(5 * 1024 * 1024)}
	call(t, sender, "send_file", args, protocol.Policy{})
	sender.WaitTransfers()
	if len(relay.reports) != 0 {
		t.Fatalf("send failed: %v", relay.reports)
	}
	if len(relay.parts) != 3 || len(relay.parts[3]) != 1024*1024+17 || relay.completed != hexSum(data) {
		t.Fatalf("parts %d, last %d, sha %s", len(relay.parts), len(relay.parts[3]), relay.completed)
	}
	relay.staged = append(append(append([]byte{}, relay.parts[1]...), relay.parts[2]...), relay.parts[3]...)
	relay.info = TransferInfo{Status: "staged", Size: int64(len(data)), SHA256: relay.completed}
	receiver := New("full")
	defer receiver.Close()
	receiver.Transfers = relay
	target := filepath.Join(dir, "pc", "render.mov")
	call(t, receiver, "receive_file", map[string]any{"transfer_id": "transfer-1", "path": target, "size": float64(len(data))}, protocol.Policy{WorkspaceRoots: []string{filepath.Join(dir, "pc")}})
	receiver.WaitTransfers()
	if r := relay.last(t); r["status"] != "delivered" {
		t.Fatalf("report %v", r)
	}
	if got, _ := os.ReadFile(target); hexSum(got) != hexSum(data) {
		t.Fatal("copy is not byte-identical")
	}

	// The size the Relay read must still be the file's size.
	args["size"] = float64(len(data) + 1)
	if _, e := sender.Call(context.Background(), "send_file", args, protocol.Policy{}); e == nil || !strings.HasPrefix(e.Error(), "FILE_CHANGED_DURING_READ") {
		t.Fatalf("size change accepted: %v", e)
	}
	// Sensitive paths stay protected for reads.
	secret := filepath.Join(dir, ".ssh", "id_rsa")
	os.MkdirAll(filepath.Dir(secret), 0700)
	os.WriteFile(secret, []byte("k"), 0600)
	if _, e := sender.Call(context.Background(), "send_file", map[string]any{"transfer_id": "transfer-2", "path": secret, "size": float64(1)}, protocol.Policy{}); e == nil || !strings.Contains(e.Error(), "Sensitive Path") {
		t.Fatalf("sensitive file sent: %v", e)
	}
}
