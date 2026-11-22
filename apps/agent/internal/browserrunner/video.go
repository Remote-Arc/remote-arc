package browserrunner

import (
	"bytes"
	"context"
	"encoding/base64"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"
	"github.com/pion/webrtc/v4/pkg/media/h264reader"
)

const videoFPS = 15

// VideoSignal contains signaling only. Encoded media never uses the Relay socket.
type VideoSignal struct {
	Type      string `json:"type"`
	Action    string `json:"action"`
	SessionID string `json:"session_id"`
	StreamID  string `json:"stream_id"`
	SDP       string `json:"sdp,omitempty"`
	Mid       string `json:"mid,omitempty"`
}

type videoStream struct {
	id      string
	ctx     context.Context
	cancel  context.CancelFunc
	frames  chan []byte // latest JPEG only; a slow encoder cannot queue page history
	answers chan string
	signal  func(action, sdp, mid string)
	last    time.Time // guarded by session.ev
}

func videoExecutable() (string, error) {
	name := os.Getenv("REMOTEARC_FFMPEG_PATH")
	if name == "" {
		name = "ffmpeg"
	}
	return exec.LookPath(name)
}

func (m *Manager) VideoAvailable() bool {
	if os.Getenv("REMOTEARC_RUNNER_VIDEO") != "1" {
		return false
	}
	_, err := videoExecutable()
	return err == nil
}

func (m *Manager) VideoSignals() <-chan VideoSignal { return m.videoSignals }

// VideoControl is internal owner-authenticated signaling, never an AI action.
func (m *Manager) VideoControl(v VideoSignal) {
	if !idPattern.MatchString(v.SessionID) || !idPattern.MatchString(v.StreamID) {
		return
	}
	m.mu.Lock()
	s := m.sessions[v.SessionID]
	m.mu.Unlock()
	if s == nil {
		return
	}
	if v.Action == "start" {
		if !s.mu.TryLock() {
			return
		}
		defer s.mu.Unlock()
		if !s.live() {
			return
		}
	}
	s.ev.Lock()
	defer s.ev.Unlock()
	if v.Action == "stop" {
		if s.video != nil && s.video.id == v.StreamID {
			s.stopVideoLocked()
		}
		return
	}
	if v.Action == "answer" {
		if s.video != nil && s.video.id == v.StreamID && len(v.SDP) > 0 && videoAnswerOnly(v.SDP) {
			select {
			case s.video.answers <- v.SDP:
			default:
			}
		}
		return
	}
	if v.Action != "start" || !m.VideoAvailable() || !time.Now().Before(s.viewUntil) {
		return
	}
	if s.video != nil {
		return // duplicate starts cannot replace an authorized active publication
	}
	ctx, cancel := context.WithCancel(context.Background())
	stream := &videoStream{id: v.StreamID, ctx: ctx, cancel: cancel, frames: make(chan []byte, 1), answers: make(chan string, 1)}
	stream.signal = func(action, sdp, mid string) {
		select {
		case m.videoSignals <- VideoSignal{Type: "runner_video", Action: action, SessionID: v.SessionID, StreamID: v.StreamID, SDP: sdp, Mid: mid}:
		default:
			cancel() // signaling backpressure fails closed to JPEG
		}
	}
	s.video = stream
	s.viewConn = s.conn
	s.restartViewLocked()
	go stream.watchLease(s)
	go func() {
		stream.run()
		cancel()
		s.ev.Lock()
		if s.video == stream {
			s.video = nil
			s.restartViewLocked()
		}
		s.ev.Unlock()
		stream.signal("ended", "", "")
	}()
}

// The session action mutex can be busy for a long page operation. Media's
// viewer lease must expire independently of that operation or the reaper.
func (v *videoStream) watchLease(s *session) {
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	for {
		select {
		case <-v.ctx.Done():
			return
		case <-tick.C:
			s.ev.Lock()
			expired := s.video != v || !time.Now().Before(s.viewUntil)
			if expired && s.video == v {
				s.stopVideoLocked()
			}
			s.ev.Unlock()
			if expired {
				v.cancel()
				return
			}
		}
	}
}

// StopViews also runs at Relay disconnect/revocation. A missed heartbeat cannot
// leave a video publisher encoding while the account connection is down.
func (m *Manager) StopViews() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, s := range m.sessions {
		s.ev.Lock()
		s.viewUntil = time.Time{}
		s.stopVideoLocked()
		s.cancelViewCapture()
		s.ev.Unlock()
	}
}

func (s *session) restartViewLocked() {
	if s.viewConn != nil && s.viewActive {
		s.viewConn.Fire("Page.stopScreencast", nil)
	}
	s.viewActive = false
	s.cancelViewCapture()
}

func (s *session) stopVideoLocked() {
	if s.video != nil {
		s.video.cancel()
		s.video = nil
		s.restartViewLocked()
	}
}

// offerVideoFrame runs under ev and performs only bounded non-blocking work.
func (s *session) offerVideoFrame(data string) {
	v := s.video
	if v == nil || !time.Now().Before(s.viewUntil) || time.Since(v.last) < time.Second/videoFPS || len(data) > (maxFrameBytes/3)*4 {
		return
	}
	raw, err := base64.StdEncoding.DecodeString(data)
	if err != nil || len(raw) < 4 || !bytes.HasPrefix(raw, []byte{0xff, 0xd8}) {
		return
	}
	v.last = time.Now()
	select {
	case <-v.frames:
	default:
	}
	select {
	case v.frames <- raw:
	default:
	}
}

func (v *videoStream) run() {
	pc, err := webrtc.NewPeerConnection(webrtc.Configuration{ICEServers: []webrtc.ICEServer{{URLs: []string{"stun:stun.cloudflare.com:3478"}}}})
	if err != nil {
		return
	}
	defer pc.Close()
	track, err := webrtc.NewTrackLocalStaticSample(webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeH264, ClockRate: 90000, SDPFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f"}, "screen", "runner")
	if err != nil {
		return
	}
	transceiver, err := pc.AddTransceiverFromTrack(track, webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionSendonly})
	if err != nil {
		return
	}
	if transceiver.SetCodecPreferences([]webrtc.RTPCodecParameters{{RTPCodecCapability: track.Codec(), PayloadType: 106}}) != nil {
		return
	}
	// Drain RTCP so Pion's retransmission interceptors can process NACKs. The
	// encoder emits an IDR every second, bounding recovery/new-subscriber delay.
	go func() {
		buf := make([]byte, 1500)
		for {
			if _, _, err := transceiver.Sender().Read(buf); err != nil {
				return
			}
		}
	}()
	connected := make(chan struct{})
	var once sync.Once
	pc.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		if state == webrtc.PeerConnectionStateConnected {
			once.Do(func() { close(connected) })
		}
		if state == webrtc.PeerConnectionStateFailed || state == webrtc.PeerConnectionStateDisconnected {
			v.cancel()
		}
	})
	offer, err := pc.CreateOffer(nil)
	if err != nil {
		return
	}
	gathered := webrtc.GatheringCompletePromise(pc)
	if pc.SetLocalDescription(offer) != nil {
		return
	}
	setup, cancel := context.WithTimeout(v.ctx, 15*time.Second)
	defer cancel()
	select {
	case <-gathered:
	case <-setup.Done():
		return
	}
	v.signal("offer", pc.LocalDescription().SDP, transceiver.Mid())
	select {
	case answer := <-v.answers:
		if pc.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeAnswer, SDP: answer}) != nil {
			return
		}
	case <-setup.Done():
		return
	}
	select {
	case <-connected:
	case <-setup.Done():
		return
	}
	v.signal("ready", "", "")
	v.encode(track)
}

func videoEncoderArgs(encoder string) []string {
	args := []string{"-hide_banner", "-loglevel", "error", "-probesize", "32", "-analyzeduration", "0", "-fpsprobesize", "0", "-f", "image2pipe", "-framerate", "15", "-c:v", "mjpeg", "-i", "pipe:0", "-an", "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", encoder, "-pix_fmt", "yuv420p", "-b:v", "1000k", "-maxrate", "1500k", "-bufsize", "1000k", "-g", "15", "-bf", "0"}
	if encoder == "libx264" {
		args = append(args, "-preset", "ultrafast", "-tune", "zerolatency", "-profile:v", "baseline", "-x264-params", "repeat-headers=1:scenecut=0:aud=1")
	} else if encoder == "h264_videotoolbox" {
		args = append(args, "-realtime", "1", "-profile:v", "baseline")
	}
	return append(args, "-bsf:v", "h264_metadata=aud=insert", "-flush_packets", "1", "-f", "h264", "pipe:1")
}

func (v *videoStream) encode(track *webrtc.TrackLocalStaticSample) {
	exe, err := videoExecutable()
	if err != nil {
		return
	}
	encoder := os.Getenv("REMOTEARC_VIDEO_ENCODER")
	if encoder == "" {
		encoder = "libx264"
		if runtime.GOOS == "darwin" {
			encoder = "h264_videotoolbox"
		}
	}
	if encoder != "libx264" && encoder != "h264_videotoolbox" && encoder != "h264_qsv" {
		return
	}
	cmd := exec.CommandContext(v.ctx, exe, videoEncoderArgs(encoder)...)
	prepareVideoCommand(cmd)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		stdin.Close()
		return
	}
	cmd.Stderr = io.Discard // page data, arguments and encoder output are never journaled
	if cmd.Start() != nil {
		stdin.Close()
		stdout.Close()
		return
	}
	defer func() { v.cancel(); stdin.Close(); _ = cmd.Wait() }()
	writerDone := make(chan struct{})
	defer func() { v.cancel(); <-writerDone }()
	go func() {
		defer close(writerDone)
		defer stdin.Close()
		tick := time.NewTicker(time.Second / videoFPS)
		defer tick.Stop()
		var latest []byte
		for {
			select {
			case <-v.ctx.Done():
				return
			case frame := <-v.frames:
				latest = frame
			case <-tick.C:
				if len(latest) > 0 {
					if _, err := stdin.Write(latest); err != nil {
						return
					}
				}
			}
		}
	}()
	reader, err := h264reader.NewReader(stdout)
	if err != nil {
		return
	}
	var accessUnit []byte
	for {
		nal, err := reader.NextNAL()
		if err != nil {
			return
		}
		if nal.UnitType == h264reader.NalUnitTypeAUD && len(accessUnit) > 0 {
			if track.WriteSample(media.Sample{Data: accessUnit, Duration: time.Second / videoFPS}) != nil {
				return
			}
			accessUnit = nil
		}
		if len(accessUnit)+len(nal.Data) > 2*1024*1024 {
			return
		}
		accessUnit = append(accessUnit, 0, 0, 0, 1)
		accessUnit = append(accessUnit, nal.Data...)
	}
}

// Keep string validation independent of SDP contents returned by the provider.
func videoAnswerOnly(sdp string) bool {
	return len(sdp) <= 65536 && !strings.Contains(sdp, "\nm=audio ") && !strings.Contains(sdp, "\nm=application ")
}
