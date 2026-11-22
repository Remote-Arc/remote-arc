package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"strings"
	"testing"
	"time"
)

const handle = "sec_abcdefghijklmnopqrstuvwx"

// seal does what the user's browser does: encrypt to the device key.
func seal(t *testing.T, devicePub, h, value string) (string, string, string) {
	t.Helper()
	raw, err := base64.RawURLEncoding.DecodeString(devicePub)
	if err != nil {
		t.Fatal(err)
	}
	pub, err := ecdh.P256().NewPublicKey(raw)
	if err != nil {
		t.Fatal(err)
	}
	eph, _ := ecdh.P256().GenerateKey(rand.Reader)
	shared, _ := eph.ECDH(pub)
	key, _ := hkdf.Key(sha256.New, shared, nil, Info(h), 32)
	block, _ := aes.NewCipher(key)
	gcm, _ := cipher.NewGCM(block)
	iv := make([]byte, 12)
	rand.Read(iv)
	enc := base64.RawURLEncoding.EncodeToString
	return enc(eph.PublicKey().Bytes()), enc(iv), enc(gcm.Seal(nil, iv, []byte(value), []byte(h)))
}

func TestDeliverOnceTakeOnce(t *testing.T) {
	s := New()
	pub, err := s.Prepare(handle)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Take(handle); err == nil || !strings.HasPrefix(err.Error(), "SECRET_PENDING") {
		t.Fatalf("a secret the user has not entered is pending, got %v", err)
	}
	epk, iv, ct := seal(t, pub, handle, "sk-live-123456")
	if err := s.Deliver(handle, epk, iv, ct); err != nil {
		t.Fatal(err)
	}
	if err := s.Deliver(handle, epk, iv, ct); err == nil {
		t.Fatal("the same request cannot be delivered twice")
	}
	v, err := s.Take(handle)
	if err != nil || v != "sk-live-123456" {
		t.Fatalf("got %q, %v", v, err)
	}
	if _, err := s.Take(handle); err == nil || !strings.HasPrefix(err.Error(), "SECRET_NOT_FOUND") {
		t.Fatalf("a secret is handed out once, got %v", err)
	}
}

func TestRejectsTamperingAndOtherHandles(t *testing.T) {
	s := New()
	pub, _ := s.Prepare(handle)
	epk, iv, ct := seal(t, pub, "sec_zzzzzzzzzzzzzzzzzzzzzzzz", "value")
	if err := s.Deliver(handle, epk, iv, ct); err == nil || !strings.HasPrefix(err.Error(), "SECRET_UNREADABLE") {
		t.Fatalf("ciphertext bound to another handle must not open, got %v", err)
	}
	if _, err := s.Take(handle); err == nil {
		t.Fatal("a failed delivery leaves nothing to take")
	}
	pub, _ = s.Prepare("sec_bbbbbbbbbbbbbbbbbbbbbbbb")
	epk, iv, ct = seal(t, pub, "sec_bbbbbbbbbbbbbbbbbbbbbbbb", "value")
	flipped := []byte(ct)
	flipped[0] ^= 1
	if err := s.Deliver("sec_bbbbbbbbbbbbbbbbbbbbbbbb", epk, iv, string(flipped)); err == nil {
		t.Fatal("tampered ciphertext must not open")
	}
	if _, err := s.Prepare("../etc"); err == nil {
		t.Fatal("handles are checked")
	}
	if _, err := s.Prepare(handle); err != nil {
		t.Fatal("a handle whose delivery failed can be prepared again by a new request")
	}
	if _, err := s.Prepare(handle); err == nil {
		t.Fatal("a live handle cannot be prepared twice")
	}
}

func TestExpires(t *testing.T) {
	s := New()
	at := time.Unix(1_800_000_000, 0)
	s.now = func() time.Time { return at }
	pub, _ := s.Prepare(handle)
	at = at.Add(Lifetime - time.Second)
	epk, iv, ct := seal(t, pub, handle, "value")
	if err := s.Deliver(handle, epk, iv, ct); err != nil {
		t.Fatal(err)
	}
	at = at.Add(Lifetime)
	if _, err := s.Take(handle); err == nil {
		t.Fatal("an unused secret expires 10 minutes after delivery")
	}
	pub, _ = s.Prepare(handle)
	at = at.Add(Lifetime)
	epk, iv, ct = seal(t, pub, handle, "value")
	if err := s.Deliver(handle, epk, iv, ct); err == nil {
		t.Fatal("a request the user did not answer in 10 minutes expires")
	}
}

// A value sealed by the Dashboard page (apps/ui/src/features/secrets/
// secret-crypto.ts, run in Node's WebCrypto) to a fixed device key. The Go
// Agent must open what the browser seals.
func TestOpensWhatTheBrowserSeals(t *testing.T) {
	d := make([]byte, 32)
	for i := range d {
		d[i] = byte(i + 1)
	}
	key, err := ecdh.P256().NewPrivateKey(d)
	if err != nil {
		t.Fatal(err)
	}
	const h = "sec_vectorvectorvectorvector"
	got, err := open(key, h,
		"BGpl-hfWGDvQ7XuF33rgOJYdBAElGggVAyH4h9esUK_2oo0g6i_V4AZvn7SY-tG86JaIFD929pSNVuRSChD_hd8",
		"vwn8pf_M6BrWMv07",
		"9LeBF4Cb3zw0QxHzwl8sxXRvaOEq6OaTTgxsyjDrvGFsuDvr")
	if err != nil || got != "browser-sealed-value" {
		t.Fatalf("got %q, %v", got, err)
	}
	if base64.RawURLEncoding.EncodeToString(key.PublicKey().Bytes()) != "BFFcPW6545a5BNP-yn9U_c0MwemXvzddylFa0KbDtANfRTa-OlDzGPv5pUdZAqIhUCvvDVfgjFOyzApW8X2fk1Q" {
		t.Fatal("the vector's device key changed")
	}
}
