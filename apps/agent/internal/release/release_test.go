package release

import "testing"

func TestOlderOrdersReleasesAndPreReleases(t *testing.T) {
	for _, c := range [][2]string{
		{"0.6.1", "0.6.2"},
		{"0.6.9", "0.7.0"},
		{"0.9.9", "1.0.0"},
		{"0.6.1", "0.6.2-rc.3"},
		{"0.6.1-rc.5", "0.6.2-rc.4"},
		{"0.6.2-rc.3", "0.6.2-rc.4"},
		{"0.6.2-rc.9", "0.6.2-rc.10"},
		{"0.6.2-rc.4", "0.6.2"},
		{"0.6.2-alpha", "0.6.2-alpha.1"},
		{"0.6.2-1", "0.6.2-rc"},
		{"1.2.3-alpha", "1.2.3-beta"},
		{"v0.5.9", "0.6.0+build.7"},
	} {
		if !Older(c[0], c[1]) {
			t.Fatalf("%s should be older than %s", c[0], c[1])
		}
		if Older(c[1], c[0]) {
			t.Fatalf("%s should not be older than %s", c[1], c[0])
		}
	}
}

func TestOlderNeverTreatsUnclearVersionsAsAnUpgrade(t *testing.T) {
	for _, c := range [][2]string{
		{"0.6.2", "0.6.2"},
		{"0.6.2-rc.4", "0.6.2-rc.4"},
		{"0.6.2+a", "0.6.2+b"},
		{"", "0.6.2"},
		{"test", "0.6.2"},
		{"0.6.1", "dev"},
		{"01.2.3", "1.2.4"},
		{"1.2", "1.2.1"},
		{"1.2.3.4", "1.2.4"},
		{"-1.2.3", "1.2.4"},
		{"1.x.3", "1.2.4"},
		{"1.2.3-", "1.2.4"},
		{"1.2.3-rc..1", "1.2.4"},
	} {
		if Older(c[0], c[1]) {
			t.Fatalf("%q vs %q must never be treated as an upgrade", c[0], c[1])
		}
	}
}
