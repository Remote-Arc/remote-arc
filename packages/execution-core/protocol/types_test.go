package protocol

import (
	"math"
	"strings"
	"testing"
)

func TestIntegerValidation(t *testing.T) {
	for _, v := range []any{1.1, "2", float64(-1), float64(181)} {
		if _, e := Integer(map[string]any{"s": v}, "s", 120, 0, 180); e == nil {
			t.Fatalf("accepted %v", v)
		}
	}
	if n, e := Integer(nil, "s", 120, 0, 180); e != nil || n != 120 {
		t.Fatal("default missing")
	}
}
func TestPolicyNormalizationBoundsAndDuplicates(t *testing.T) {
	roots := []string{"", " ", "root", "root"}
	for i := 0; i < 40; i++ {
		roots = append(roots, string(rune('a'+i)))
	}
	p := Normalize(Policy{WorkspaceRoots: roots, SensitivePaths: roots, SensitiveAllowPaths: roots, TaskWorkspaceRoot: " "})
	if len(p.WorkspaceRoots) != 32 || p.WorkspaceRoots[0] != "root" || len(p.SensitivePaths) != 32 || len(p.SensitiveAllowPaths) != 32 || p.TaskWorkspaceRoot != "" {
		t.Fatal("normalization changed")
	}
}

func TestTextResultSerializesStructuredValuesAndPassesStrings(t *testing.T) {
	plain := TextResult("hello")
	if plain.IsError || len(plain.Content) != 1 || plain.Content[0].Type != "text" || plain.Content[0].Text != "hello" {
		t.Fatalf("plain text: %#v", plain)
	}
	structured := TextResult(map[string]int{"count": 2})
	if len(structured.Content) != 1 || !strings.Contains(structured.Content[0].Text, "\"count\": 2") {
		t.Fatalf("structured text: %#v", structured)
	}
}

func TestArgumentHelpersRejectInvalidTypesAndUseSafeDefaults(t *testing.T) {
	if got, err := String(map[string]any{"name": "file"}, "name"); err != nil || got != "file" {
		t.Fatalf("expected valid string, got %q: %v", got, err)
	}
	if _, err := String(map[string]any{"name": 123}, "name"); err == nil {
		t.Fatal("number accepted as string")
	}
	if got, err := String(nil, "missing"); err == nil || got != "" {
		t.Fatal("missing string should be rejected")
	}
	if got := OptionalString(map[string]any{"name": "yes"}, "name"); got != "yes" {
		t.Fatalf("optional string = %q", got)
	}
	if got := OptionalString(map[string]any{"name": true}, "name"); got != "" {
		t.Fatalf("invalid optional string = %q", got)
	}
	for _, tt := range []struct {
		name     string
		value    any
		expected int
	}{
		{"float", float64(4), 4},
		{"integer", int(5), 5},
		{"string fallback", "6", 20},
		{"NaN fallback", math.NaN(), 20},
		{"positive infinity fallback", math.Inf(1), 20},
		{"negative infinity fallback", math.Inf(-1), 20},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := Number(map[string]any{"n": tt.value}, "n", 20); got != tt.expected {
				t.Fatalf("Number(%v) = %d, expected %d", tt.value, got, tt.expected)
			}
		})
	}
	if got := Number(nil, "n", 9); got != 9 {
		t.Fatalf("missing number = %d", got)
	}
	if !Bool(map[string]any{"ok": true}, "ok") || Bool(map[string]any{"ok": "true"}, "ok") || Bool(nil, "ok") {
		t.Fatal("bool coercion is unsafe")
	}
	disabled, enabled := false, true
	if !Enabled(nil) || Enabled(&disabled) || !Enabled(&enabled) {
		t.Fatal("default-enabled semantics violated")
	}
	if Platform("windows") != "win32" || Platform("darwin") != "darwin" {
		t.Fatal("platform normalization changed")
	}
}

func TestIntegerValidBoundariesAndInvalidSpecialValues(t *testing.T) {
	for _, value := range []any{0, 180, float64(0), float64(180), float64(25)} {
		got, err := Integer(map[string]any{"n": value}, "n", 8, 0, 180)
		if err != nil || float64(got) != toFloat(value) {
			t.Fatalf("valid value %v was rejected: %v (%d)", value, err, got)
		}
	}
	for _, value := range []any{math.NaN(), math.Inf(1), math.Inf(-1), -1, 181, 3.5, nil, "20"} {
		if got, err := Integer(map[string]any{"n": value}, "n", 8, 0, 180); err == nil {
			t.Fatalf("invalid value %v accepted as %d", value, got)
		}
	}
}

func toFloat(v any) float64 {
	switch n := v.(type) {
	case int:
		return float64(n)
	case float64:
		return n
	default:
		return math.NaN()
	}
}
