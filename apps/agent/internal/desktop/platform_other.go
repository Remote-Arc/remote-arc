//go:build !(windows && (amd64 || arm64)) && !linux

package desktop

import (
	"errors"
	"image"
	"time"
)

// Desktop control is implemented for Windows first. Elsewhere the tools are
// not advertised, and a call that arrives anyway is refused.
type unsupported struct{}

func newPlatform() platform { return unsupported{} }

var errUnsupported = errors.New("desktop control is available on Windows and Linux (X11) computers for now")

func (unsupported) Ready() error                                  { return errUnsupported }
func (unsupported) Start() error                                  { return errUnsupported }
func (unsupported) Displays() ([]Display, error)                  { return nil, errUnsupported }
func (unsupported) Capture(Rect) (*image.RGBA, error)             { return nil, errUnsupported }
func (unsupported) Windows() ([]Window, error)                    { return nil, errUnsupported }
func (unsupported) Elements(Window, int) ([]Element, bool, error) { return nil, false, errUnsupported }
func (unsupported) WindowAt(int, int) (Window, error)             { return Window{}, errUnsupported }
func (unsupported) Cursor() (int, int, error)                     { return 0, 0, errUnsupported }
func (unsupported) Locked() bool                                  { return false }
func (unsupported) LastUserInput() time.Time                      { return time.Time{} }
func (unsupported) Send([]Step, func() bool) (int, error)         { return 0, errUnsupported }
func (unsupported) Focus(Window) error                            { return errUnsupported }
func (unsupported) Indicate(bool)                                 {}
