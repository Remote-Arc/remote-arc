//go:build linux

package desktop

import (
	"image"
	"image/color"
	"sync"
	"sync/atomic"

	"github.com/jezek/xgb"
	"github.com/jezek/xgb/xproto"
	"golang.org/x/image/draw"
	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

// The bitmap font has ASCII and Latin-1 only, and its text is drawn at
// twice its size, so the X11 notice says it more briefly.
const x11NoticeText = "Remote Arc: AI is using this computer - move the mouse to stop"

// x11Notice is a borderless, always-on-top bar across the top of the
// primary display that says AI is using the computer. The window manager
// never manages it (override-redirect), so it takes no focus or clicks.
type x11Notice struct {
	conn   *xgb.Conn
	window xproto.Window
	gc     xproto.Gcontext
	pixels []byte // BGRX rows ready for PutImage
	width  int
	height int
	shown  atomic.Bool
	mu     sync.Mutex
}

func newX11Notice(conn *xgb.Conn) *x11Notice {
	screen := xproto.Setup(conn).DefaultScreen(conn)
	if screen.RootDepth != 24 && screen.RootDepth != 32 {
		return nil
	}
	width := max(960, int(screen.WidthInPixels)*2/5)
	height := 50
	window, err := xproto.NewWindowId(conn)
	if err != nil {
		return nil
	}
	gc, err := xproto.NewGcontextId(conn)
	if err != nil {
		return nil
	}
	x := (int(screen.WidthInPixels) - width) / 2
	err = xproto.CreateWindowChecked(conn, screen.RootDepth, window, screen.Root, int16(x), 8, uint16(width), uint16(height), 0,
		xproto.WindowClassInputOutput, screen.RootVisual,
		xproto.CwBackPixel|xproto.CwOverrideRedirect|xproto.CwEventMask,
		[]uint32{0x6d28d9, 1, xproto.EventMaskExposure}).Check()
	if err != nil {
		return nil
	}
	xproto.CreateGC(conn, gc, xproto.Drawable(window), 0, nil)
	n := &x11Notice{conn: conn, window: window, gc: gc, width: width, height: height, pixels: renderNotice(width, height)}
	go n.redraw()
	return n
}

func (n *x11Notice) show() {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.shown.Store(true)
	xproto.MapWindow(n.conn, n.window)
	xproto.ConfigureWindow(n.conn, n.window, xproto.ConfigWindowStackMode, []uint32{xproto.StackModeAbove})
	n.paint()
	n.conn.Sync()
}

func (n *x11Notice) hide() {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.shown.Store(false)
	xproto.UnmapWindow(n.conn, n.window)
	n.conn.Sync()
}

// paint sends the bar in strips that stay under the core request size limit.
func (n *x11Notice) paint() {
	const rows = 16
	stride := n.width * 4
	for y := 0; y < n.height; y += rows {
		h := min(rows, n.height-y)
		xproto.PutImage(n.conn, xproto.ImageFormatZPixmap, xproto.Drawable(n.window), n.gc,
			uint16(n.width), uint16(h), 0, int16(y), 0, 24, n.pixels[y*stride:(y+h)*stride])
	}
}

// redraw repaints the bar whenever the server asks for it.
func (n *x11Notice) redraw() {
	for {
		event, err := n.conn.WaitForEvent()
		if event == nil && err == nil {
			return
		}
		if expose, ok := event.(xproto.ExposeEvent); ok && expose.Window == n.window && expose.Count == 0 {
			n.mu.Lock()
			if n.shown.Load() {
				n.paint()
			}
			n.mu.Unlock()
		}
	}
}

// renderNotice draws an amber frame around a violet bar with a red dot and
// the notice text, as BGRX pixels.
func renderNotice(width, height int) []byte {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(img, img.Bounds(), image.NewUniform(color.RGBA{0xff, 0xc4, 0x00, 0xff}), image.Point{}, draw.Src)
	draw.Draw(img, image.Rect(3, 3, width-3, height-3), image.NewUniform(color.RGBA{0x6d, 0x28, 0xd9, 0xff}), image.Point{}, draw.Src)
	cx, cy, r := 26, height/2, 7
	for y := cy - r; y <= cy+r; y++ {
		for x := cx - r; x <= cx+r; x++ {
			if (x-cx)*(x-cx)+(y-cy)*(y-cy) <= r*r {
				img.Set(x, y, color.RGBA{0xff, 0x3b, 0x3b, 0xff})
			}
		}
	}
	// The built-in 7x13 bitmap font, drawn at twice its size.
	small := image.NewRGBA(image.Rect(0, 0, (width-60)/2, height/2))
	d := &font.Drawer{Dst: small, Src: image.White, Face: basicfont.Face7x13}
	text := x11NoticeText
	for d.MeasureString(text).Ceil() > small.Bounds().Dx() && len([]rune(text)) > 20 {
		text = string([]rune(text)[:len([]rune(text))-2]) + "…"
	}
	d.Dot = fixed.P((small.Bounds().Dx()-d.MeasureString(text).Ceil())/2, small.Bounds().Dy()/2+5)
	d.DrawString(text)
	for y := 0; y < small.Bounds().Dy()*2; y++ {
		for x := 0; x < small.Bounds().Dx()*2; x++ {
			if _, _, _, a := small.At(x/2, y/2).RGBA(); a > 0x8000 {
				img.Set(44+x, y, color.White)
			}
		}
	}
	out := make([]byte, width*height*4)
	for i := 0; i < width*height; i++ {
		out[i*4], out[i*4+1], out[i*4+2] = img.Pix[i*4+2], img.Pix[i*4+1], img.Pix[i*4]
	}
	return out
}
