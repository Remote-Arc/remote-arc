package execution

import (
	"errors"
	"io/fs"
	"os"
	"syscall"
)

// errNotADirectory reports a path that exists but is not a folder, from
// checks made here. syscall.ENOTDIR cannot say this on Windows, where it is
// ERROR_PATH_NOT_FOUND and so reads as a missing path.
var errNotADirectory = errors.New("not a directory")

// codedFileError puts a fixed code in front of an os file error. The Relay
// reads the code instead of platform text, which differs between macOS, Linux
// and Windows; the original message, path included, still follows it.
type codedFileError struct {
	code string
	err  error
}

func (e codedFileError) Error() string { return e.code + ": " + e.err.Error() }
func (e codedFileError) Unwrap() error { return e.err }

// fileErrorCode codes only errors from the file system. Policy blocks, coded
// errors and messages written here pass through unchanged.
func fileErrorCode(err error) error {
	var pathErr *fs.PathError
	var linkErr *os.LinkError
	if err == nil || (!errors.As(err, &pathErr) && !errors.As(err, &linkErr)) {
		return err
	}
	switch {
	case errors.Is(err, errNotADirectory):
		return codedFileError{"PATH_TYPE_MISMATCH", err}
	case errors.Is(err, fs.ErrNotExist):
		return codedFileError{"PATH_NOT_FOUND", err}
	case errors.Is(err, fs.ErrPermission):
		return codedFileError{"FILE_PERMISSION_DENIED", err}
	case errors.Is(err, syscall.ENOTDIR), errors.Is(err, syscall.EISDIR):
		return codedFileError{"PATH_TYPE_MISMATCH", err}
	}
	return err
}
