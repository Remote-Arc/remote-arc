package execution

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/policy"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// File transfers move large files through a short-lived staging object on the
// Relay (docs/file-transfer.md). A device call only starts the job: the bytes
// travel over HTTPS in the background, outside the 45 s call and the control
// connection, and the job reports its outcome to the Relay itself.

// MaxTransferBytes matches the Relay's per-transfer limit.
const MaxTransferBytes int64 = 5 * 1024 * 1024 * 1024

// TransferInfo is the Relay's view of one transfer, as the target polls it.
type TransferInfo struct {
	ID        string `json:"id"`
	Status    string `json:"status"`
	Size      int64  `json:"size"`
	SHA256    string `json:"sha256"`
	ExpiresAt string `json:"expires_at"`
}

// TransferClient reaches the Relay's device transfer API with this device's
// credential. The Agent supplies it; without one the transfer tools are hidden.
type TransferClient interface {
	Info(ctx context.Context, id string) (TransferInfo, error)
	// Download returns the staged bytes from offset to the end.
	Download(ctx context.Context, id string, offset int64) (io.ReadCloser, error)
	UploadPart(ctx context.Context, id string, part int, body io.Reader, length int64) error
	SourceComplete(ctx context.Context, id, sha256 string, size int64) error
	Report(ctx context.Context, id string, report map[string]any) error
}

// Transfer tools need a TransferClient, so a Core without one does not list them.
var transferTools = map[string]bool{"receive_file": true, "send_file": true}

// Tests shorten these.
var (
	transferPollMin      = 2 * time.Second
	transferPollMax      = 10 * time.Second
	transferRetryDelay   = 2 * time.Second
	transferAttempts     = 8
	transferWaitFallback = 6 * time.Hour
)

var transferID = regexp.MustCompile(`^[A-Za-z0-9-]{8,64}$`)
var hexSHA256 = regexp.MustCompile(`^[0-9a-f]{64}$`)

type transferJobs struct {
	mu      sync.Mutex
	running map[string]bool
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
}

// start runs one job per transfer id; a repeated call for a running id is a no-op.
func (c *Core) startTransferJob(id string, run func(context.Context)) bool {
	c.jobs.mu.Lock()
	defer c.jobs.mu.Unlock()
	if c.jobs.ctx == nil {
		c.jobs.ctx, c.jobs.cancel = context.WithCancel(context.Background())
		c.jobs.running = map[string]bool{}
	}
	if c.jobs.running[id] {
		return false
	}
	c.jobs.running[id] = true
	c.jobs.wg.Add(1)
	ctx := c.jobs.ctx
	go func() {
		defer func() {
			c.jobs.mu.Lock()
			delete(c.jobs.running, id)
			c.jobs.mu.Unlock()
			c.jobs.wg.Done()
		}()
		run(ctx)
	}()
	return true
}

// WaitTransfers blocks until every running transfer job has ended. Tests use it.
func (c *Core) WaitTransfers() { c.jobs.wg.Wait() }

func (c *Core) stopTransfers() {
	c.jobs.mu.Lock()
	cancel := c.jobs.cancel
	c.jobs.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

type transferArgs struct {
	id        string
	size      int64
	sha256    string
	overwrite bool
}

func parseTransferArgs(args map[string]any) (transferArgs, error) {
	id, e := protocol.String(args, "transfer_id")
	if e != nil {
		return transferArgs{}, e
	}
	if !transferID.MatchString(id) {
		return transferArgs{}, errors.New("transfer_id is not a Remote Arc transfer id.")
	}
	size, ok := args["size"].(float64)
	if !ok || size < 1 || size != float64(int64(size)) || int64(size) > MaxTransferBytes {
		return transferArgs{}, errors.New("size must be a whole number of bytes from 1 to 5 GiB.")
	}
	sum := strings.ToLower(protocol.OptionalString(args, "sha256"))
	if sum != "" && !hexSHA256.MatchString(sum) {
		return transferArgs{}, errors.New("sha256 must be 64 hexadecimal characters.")
	}
	return transferArgs{id: id, size: int64(size), sha256: sum, overwrite: protocol.Bool(args, "overwrite")}, nil
}

// receiveFile checks the destination now and fetches the file in the background.
// target has already passed policy.Enforce for a write.
func (c *Core) receiveFile(target string, args map[string]any, p protocol.Policy) (map[string]any, error) {
	t, e := parseTransferArgs(args)
	if e != nil {
		return nil, e
	}
	if e = checkDestination(target, t.overwrite); e != nil {
		return nil, e
	}
	started := c.startTransferJob(t.id, func(ctx context.Context) {
		report := c.runReceive(ctx, target, t, p)
		report["path"] = target
		_ = c.Transfers.Report(context.Background(), t.id, report)
	})
	return map[string]any{"transfer_id": t.id, "path": target, "accepted": true, "already_running": !started}, nil
}

func checkDestination(target string, overwrite bool) error {
	s, e := os.Stat(target)
	if errors.Is(e, os.ErrNotExist) {
		return nil
	}
	if e != nil {
		return e
	}
	if !s.Mode().IsRegular() {
		return errors.New("Path is not a file: " + target)
	}
	if !overwrite {
		return errors.New("FILE_EXISTS: " + target + " already exists. Nothing was changed. Pass overwrite:true to replace it, or choose another path.")
	}
	return nil
}

func failure(code, message string) map[string]any {
	return map[string]any{"status": "failed", "error_code": code, "error": message}
}

func partialPath(target, id string) string {
	return filepath.Join(filepath.Dir(target), "."+filepath.Base(target)+".ra-"+id[:8]+".part")
}

func (c *Core) runReceive(ctx context.Context, target string, t transferArgs, p protocol.Policy) map[string]any {
	info, report := c.waitForStaged(ctx, t)
	if report != nil {
		return report
	}
	expected := t.sha256
	if expected == "" {
		expected = strings.ToLower(info.SHA256)
	}
	if !hexSHA256.MatchString(expected) || (t.sha256 != "" && info.SHA256 != "" && !strings.EqualFold(info.SHA256, t.sha256)) {
		return failure("TRANSFER_SHA256_MISMATCH", "The staged file's SHA-256 is missing or does not match the requested one. Nothing was written.")
	}
	if info.Size != t.size {
		return failure("TRANSFER_SIZE_MISMATCH", "The staged file's size does not match the requested size. Nothing was written.")
	}
	if e := os.MkdirAll(filepath.Dir(target), 0755); e != nil {
		return failure("TRANSFER_WRITE_FAILED", readableError(e))
	}
	part := partialPath(target, t.id)
	sum, e := c.download(ctx, t.id, part, t.size)
	if e != nil {
		_ = os.Remove(part)
		if ctx.Err() != nil {
			return failure("TRANSFER_INTERRUPTED", "The Remote Arc Agent stopped during the download. Nothing was written; start a new transfer.")
		}
		return failure("TRANSFER_DOWNLOAD_FAILED", e.Error())
	}
	if sum != expected {
		_ = os.Remove(part)
		return failure("TRANSFER_SHA256_MISMATCH", "The downloaded bytes' SHA-256 ("+sum+") does not match "+expected+". Nothing was written.")
	}
	result, e := c.commitTransfer(ctx, part, target, t.overwrite, p)
	if e != nil {
		_ = os.Remove(part)
		return failure("TRANSFER_WRITE_FAILED", e.Error())
	}
	result["status"] = "delivered"
	result["sha256"] = sum
	result["bytes"] = t.size
	return result
}

func (c *Core) waitForStaged(ctx context.Context, t transferArgs) (TransferInfo, map[string]any) {
	deadline := time.Now().Add(transferWaitFallback)
	delay := transferPollMin
	failures := 0
	for {
		info, e := c.Transfers.Info(ctx, t.id)
		if e == nil {
			failures = 0
			if at, err := time.Parse(time.RFC3339Nano, info.ExpiresAt); err == nil {
				deadline = at
			}
			switch info.Status {
			case "staged", "delivering":
				return info, nil
			case "failed", "expired", "delivered", "cancelled":
				// The Relay already holds the outcome; nothing to report.
				return info, map[string]any{"status": "skipped", "relay_status": info.Status}
			}
		} else if failures++; failures >= transferAttempts {
			return info, failure("TRANSFER_RELAY_UNREACHABLE", "The Agent could not reach Remote Arc to check the transfer: "+e.Error())
		}
		if time.Now().After(deadline) {
			return info, failure("TRANSFER_EXPIRED", "The file was not uploaded before the transfer expired. Nothing was written.")
		}
		select {
		case <-ctx.Done():
			return info, failure("TRANSFER_INTERRUPTED", "The Remote Arc Agent stopped before the file was uploaded. Nothing was written; start a new transfer.")
		case <-time.After(delay):
		}
		delay = min(transferPollMax, delay*2)
	}
}

// download fetches the staged bytes into part, resuming from what an earlier
// attempt left there, and returns the SHA-256 of the whole file.
func (c *Core) download(ctx context.Context, id, part string, size int64) (string, error) {
	f, e := os.OpenFile(part, os.O_CREATE|os.O_RDWR|os.O_TRUNC, 0644)
	if e != nil {
		return "", e
	}
	defer f.Close()
	hash := sha256.New()
	var written int64
	var last error
	for attempt := 0; attempt < transferAttempts && written < size; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(transferRetryDelay):
			}
		}
		body, err := c.Transfers.Download(ctx, id, written)
		if err != nil {
			last = err
			continue
		}
		n, err := io.Copy(io.MultiWriter(f, hash), io.LimitReader(body, size-written+1))
		body.Close()
		written += n
		if written > size {
			return "", errors.New("Remote Arc sent more bytes than the transfer's size.")
		}
		if err != nil {
			last = err
			continue
		}
		if written < size {
			last = fmt.Errorf("download ended after %d of %d bytes", written, size)
		}
	}
	if written != size {
		if last == nil {
			last = errors.New("download did not complete")
		}
		return "", last
	}
	if config.FileDurability() == "durable" {
		if e = f.Sync(); e != nil {
			return "", e
		}
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

// commitTransfer moves a verified file into place under the file-change lock,
// with an Undo snapshot when this device keeps Undo.
func (c *Core) commitTransfer(ctx context.Context, part, target string, overwrite bool, p protocol.Policy) (map[string]any, error) {
	release, e := c.acquireMutation(ctx)
	if e != nil {
		return nil, e
	}
	defer release()
	// The path may have changed while the bytes were downloading (a new file,
	// or a folder swapped for a link elsewhere), so check it again.
	if _, e = policy.Enforce(target, p, true); e != nil {
		return nil, e
	}
	if e = checkDestination(target, overwrite); e != nil {
		return nil, e
	}
	var snap *snapshot
	if protocol.Enabled(p.UndoEnabled) {
		if snap, e = createSnapshot("receive_file", target); e != nil {
			return nil, e
		}
	}
	if e = replaceWithRetry(part, target); e != nil {
		discardUnchangedSnapshot(snap)
		return nil, e
	}
	if e = config.SyncDirectory(filepath.Dir(target)); e != nil {
		return nil, e
	}
	available := finalizeSnapshot(snap)
	result := map[string]any{"undo_available": available, "undo_storage": nil}
	if available {
		result["undo_storage"] = "local-device-only"
	}
	return result, nil
}

func replaceWithRetry(from, to string) error {
	var e error
	for delay := 10 * time.Millisecond; delay <= 640*time.Millisecond; delay *= 2 {
		if e = os.Rename(from, to); e == nil {
			return nil
		}
		time.Sleep(delay)
	}
	return e
}

// sendFile checks the source now and uploads it in the background.
// source has already passed policy.Enforce for a read.
func (c *Core) sendFile(source string, args map[string]any) (map[string]any, error) {
	t, e := parseTransferArgs(args)
	if e != nil {
		return nil, e
	}
	partSize, e := protocol.Integer(args, "part_size", 32*1024*1024, 5*1024*1024, 64*1024*1024)
	if e != nil {
		return nil, e
	}
	s, e := os.Stat(source)
	if e != nil {
		return nil, e
	}
	if !s.Mode().IsRegular() {
		return nil, errors.New("Path is not a file: " + source)
	}
	if s.Size() != t.size {
		return nil, fmt.Errorf("FILE_CHANGED_DURING_READ: %s is now %d bytes, not %d. Start the copy again.", source, s.Size(), t.size)
	}
	started := c.startTransferJob(t.id, func(ctx context.Context) {
		if report := c.runSend(ctx, source, t.id, s, int64(partSize)); report != nil {
			_ = c.Transfers.Report(context.Background(), t.id, report)
		}
	})
	return map[string]any{"transfer_id": t.id, "path": source, "size": s.Size(), "accepted": true, "already_running": !started}, nil
}

// runSend returns a failure report, or nil once the Relay has the whole file.
func (c *Core) runSend(ctx context.Context, source, id string, before os.FileInfo, partSize int64) map[string]any {
	revision := fileRevision(before)
	sum, e := hashFile(source)
	if e != nil {
		return failure("TRANSFER_SOURCE_READ_FAILED", readableError(e))
	}
	f, e := os.Open(source)
	if e != nil {
		return failure("TRANSFER_SOURCE_READ_FAILED", readableError(e))
	}
	defer f.Close()
	size := before.Size()
	for part, offset := 1, int64(0); offset < size; part, offset = part+1, offset+partSize {
		length := min(partSize, size-offset)
		var last error
		for attempt := 0; attempt < transferAttempts; attempt++ {
			if attempt > 0 {
				select {
				case <-ctx.Done():
					return failure("TRANSFER_INTERRUPTED", "The Remote Arc Agent stopped during the upload.")
				case <-time.After(transferRetryDelay):
				}
			}
			if last = c.Transfers.UploadPart(ctx, id, part, io.NewSectionReader(f, offset, length), length); last == nil {
				break
			}
		}
		if last != nil {
			return failure("TRANSFER_UPLOAD_FAILED", last.Error())
		}
	}
	after, e := os.Stat(source)
	if e != nil || fileRevision(after) != revision {
		return failure("FILE_CHANGED_DURING_READ", "The source file changed while it was being copied. Start the copy again.")
	}
	if e = c.Transfers.SourceComplete(ctx, id, sum, size); e != nil {
		return failure("TRANSFER_UPLOAD_FAILED", e.Error())
	}
	return nil
}
