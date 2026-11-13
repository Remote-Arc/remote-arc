// Package secrets holds one-time secrets a user typed into Remote Arc for one
// task, such as an API key to store with a command-line tool. The value is
// encrypted in the user's browser to a key made for that one request, so the
// Relay forwards only ciphertext, and an AI only ever holds the handle. It
// lives in memory only, is handed out once and expires on its own.
package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"regexp"
	"sync"
	"time"
)

// Lifetime is how long a request waits for the user, and how long a delivered
// value waits to be used.
const Lifetime = 10 * time.Minute

// MaxValue bounds what a user can paste.
const MaxValue = 16 * 1024

var handlePattern = regexp.MustCompile(`^sec_[a-z2-7]{24}$`)

// ValidHandle reports whether s is a handle the Relay issues.
func ValidHandle(s string) bool { return handlePattern.MatchString(s) }

// Info binds the derived key to one handle. The browser uses the same string.
func Info(handle string) string { return "remote-arc one-time secret v1 " + handle }

type entry struct {
	key     *ecdh.PrivateKey
	value   string
	ready   bool
	expires time.Time
}

// Store is safe for concurrent use.
type Store struct {
	mu    sync.Mutex
	items map[string]*entry
	now   func() time.Time
}

func New() *Store { return &Store{items: map[string]*entry{}, now: time.Now} }

func (s *Store) sweep() {
	now := s.now()
	for h, e := range s.items {
		if !now.Before(e.expires) {
			delete(s.items, h)
		}
	}
}

// Prepare makes the key the user's browser encrypts to and returns its public
// half (uncompressed P-256 point, base64url).
func (s *Store) Prepare(handle string) (string, error) {
	if !ValidHandle(handle) {
		return "", errors.New("invalid secret handle")
	}
	key, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sweep()
	if _, ok := s.items[handle]; ok {
		return "", errors.New("SECRET_EXISTS: this handle was already prepared on this device")
	}
	s.items[handle] = &entry{key: key, expires: s.now().Add(Lifetime)}
	return base64.RawURLEncoding.EncodeToString(key.PublicKey().Bytes()), nil
}

// Deliver decrypts what the user's browser sent. The private key is dropped
// at once, so the same request cannot be delivered twice.
func (s *Store) Deliver(handle, epk, iv, ciphertext string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sweep()
	e := s.items[handle]
	if e == nil || e.key == nil {
		return errors.New("SECRET_NOT_FOUND: this request expired or was already used on this device. Ask the user to start a new one.")
	}
	key := e.key
	e.key = nil
	value, err := open(key, handle, epk, iv, ciphertext)
	if err != nil {
		delete(s.items, handle)
		return err
	}
	e.value, e.ready, e.expires = value, true, s.now().Add(Lifetime)
	return nil
}

// Take hands the value out once.
func (s *Store) Take(handle string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sweep()
	e := s.items[handle]
	if e == nil {
		return "", errors.New("SECRET_NOT_FOUND: no secret " + handle + " is waiting on this device. It is used once and expires after 10 minutes; ask the user to enter it again with request_secret.")
	}
	if !e.ready {
		return "", errors.New("SECRET_PENDING: the user has not entered " + handle + " yet. Ask them to open the link from request_secret, then call this again.")
	}
	delete(s.items, handle)
	return e.value, nil
}

func open(key *ecdh.PrivateKey, handle, epk, iv, ciphertext string) (string, error) {
	bad := errors.New("SECRET_UNREADABLE: the encrypted secret could not be opened on this device. Ask the user to enter it again.")
	pubBytes, e1 := base64.RawURLEncoding.DecodeString(epk)
	nonce, e2 := base64.RawURLEncoding.DecodeString(iv)
	sealed, e3 := base64.RawURLEncoding.DecodeString(ciphertext)
	if e1 != nil || e2 != nil || e3 != nil || len(nonce) != 12 || len(sealed) > MaxValue*2+16 {
		return "", bad
	}
	pub, err := ecdh.P256().NewPublicKey(pubBytes)
	if err != nil {
		return "", bad
	}
	shared, err := key.ECDH(pub)
	if err != nil {
		return "", bad
	}
	aesKey, err := hkdf.Key(sha256.New, shared, nil, Info(handle), 32)
	if err != nil {
		return "", bad
	}
	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return "", bad
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", bad
	}
	plain, err := gcm.Open(nil, nonce, sealed, []byte(handle))
	if err != nil || len(plain) == 0 || len(plain) > MaxValue {
		return "", bad
	}
	return string(plain), nil
}
