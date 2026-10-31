package browserrunner

import (
	"bytes"
	"context"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"strings"
	"testing"
	"time"

	"github.com/pion/webrtc/v4"
)

// Exercise the real encoder and two real WebRTC peers; no SFU, browser, model,
// credentials or remote media service is needed. A packet, not a ready signal,
// is the evidence that publication works.
func TestVideoPublishesRealH264AndStopsOnViewerDisconnect(t *testing.T) {
	if _, err := videoExecutable(); err != nil {
		t.Skip("FFmpeg is required for H264 transport qualification")
	}
	t.Setenv("REMOTEARC_RUNNER_VIDEO", "1")
	t.Setenv("REMOTEARC_VIDEO_ENCODER", "libx264")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	receiver, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatal(err)
	}
	defer receiver.Close()
	packets := make(chan bool, 1)
	receiver.OnTrack(func(track *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		packet, _, err := track.ReadRTP()
		select {
		case packets <- err == nil && len(packet.Payload) > 0 && track.Codec().MimeType == webrtc.MimeTypeH264:
		case <-ctx.Done():
		}
	})
	m := New()
	defer m.StopViews()
	s := &session{m: m, cp: &Checkpoint{SessionID: "transport"}, conn: &staticViewClient{}, viewUntil: time.Now().Add(time.Minute)}
	m.sessions["transport"] = s
	start := VideoSignal{Action: "start", SessionID: "transport", StreamID: "publication"}
	m.VideoControl(start)
	s.ev.Lock()
	stream := s.video
	s.ev.Unlock()
	if stream == nil {
		t.Fatal("authorized viewer did not start publication")
	}
	m.VideoControl(start)
	s.ev.Lock()
	same := s.video == stream
	s.ev.Unlock()
	if !same {
		t.Fatal("duplicate start replaced publication")
	}
	var offer VideoSignal
	select {
	case offer = <-m.VideoSignals():
	case <-ctx.Done():
		t.Fatal("no video offer", ctx.Err())
	}
	if offer.Action != "offer" || offer.Mid == "" || strings.Contains(offer.SDP, "m=audio ") {
		t.Fatalf("unexpected video-only offer: %+v", offer)
	}
	if err = receiver.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: offer.SDP}); err != nil {
		t.Fatal(err)
	}
	answer, err := receiver.CreateAnswer(nil)
	if err != nil {
		t.Fatal(err)
	}
	gathered := webrtc.GatheringCompletePromise(receiver)
	if err = receiver.SetLocalDescription(answer); err != nil {
		t.Fatal(err)
	}
	select {
	case <-gathered:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	m.VideoControl(VideoSignal{Action: "answer", SessionID: "transport", StreamID: "publication", SDP: receiver.LocalDescription().SDP})
	select {
	case ready := <-m.VideoSignals():
		if ready.Action != "ready" {
			t.Fatalf("publication failed: %+v", ready)
		}
	case <-ctx.Done():
		t.Fatal("transport not ready", ctx.Err())
	}
	frame := image.NewRGBA(image.Rect(0, 0, 320, 180))
	for y := 0; y < 180; y++ {
		for x := 0; x < 320; x++ {
			frame.SetRGBA(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y), B: 100, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err = jpeg.Encode(&encoded, frame, &jpeg.Options{Quality: 70}); err != nil {
		t.Fatal(err)
	}
	s.ev.Lock()
	s.offerVideoFrame(base64.StdEncoding.EncodeToString(encoded.Bytes()))
	s.ev.Unlock()
	select {
	case ok := <-packets:
		if !ok {
			t.Fatal("no real H264 payload received")
		}
	case <-ctx.Done():
		t.Fatal("signaling succeeded but no encoded media arrived", ctx.Err())
	}
	m.VideoControl(VideoSignal{Action: "stop", SessionID: "transport", StreamID: "stale-publication"})
	select {
	case <-stream.ctx.Done():
		t.Fatal("stale stop cancelled current publication")
	default:
	}
	m.StopViews()
	select {
	case ended := <-m.VideoSignals():
		if ended.Action != "ended" {
			t.Fatalf("unexpected final event: %+v", ended)
		}
	case <-ctx.Done():
		t.Fatal("disconnect left encoder/peer running", ctx.Err())
	}
	s.ev.Lock()
	retained := s.video != nil || !s.viewUntil.IsZero()
	s.ev.Unlock()
	if retained {
		t.Fatal("disconnect retained viewer authorization")
	}
}

func TestVideoInputAndEncoderBoundaries(t *testing.T) {
	for _, encoder := range []string{"libx264", "h264_videotoolbox", "h264_qsv"} {
		args := strings.Join(videoEncoderArgs(encoder), " ")
		for _, required := range []string{"-c:v " + encoder, "-an ", "-bf 0", "-g 15", "-f h264 pipe:1"} {
			if !strings.Contains(args, required) {
				t.Fatalf("%s missing %s", encoder, required)
			}
		}
	}
	for _, sdp := range []string{strings.Repeat("x", 65537), "v=0\nm=audio 9", "v=0\nm=application 9"} {
		if videoAnswerOnly(sdp) {
			t.Fatal("unsafe SDP accepted")
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	v := &videoStream{ctx: ctx, cancel: cancel, frames: make(chan []byte, 1)}
	s := &session{video: v, viewUntil: time.Now().Add(time.Minute)}
	for _, data := range []string{"not base64!", base64.StdEncoding.EncodeToString([]byte("not JPEG")), strings.Repeat("x", maxFrameBytes*2)} {
		s.offerVideoFrame(data)
	}
	if len(v.frames) != 0 {
		t.Fatal("invalid image reached encoder")
	}
	t.Setenv("REMOTEARC_FFMPEG_PATH", t.TempDir()+"/missing")
	if New().VideoAvailable() {
		t.Fatal("missing FFmpeg advertised")
	}
	v.encode(nil) // must fail before touching a track or starting a process
}
