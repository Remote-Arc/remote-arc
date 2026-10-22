package workspaceidentity

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIdentitySurvivesContentsButDetectsReplacement(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, "project")
	if err := os.Mkdir(root, 0700); err != nil {
		t.Fatal(err)
	}
	first, err := Read(root)
	if err != nil || first == "" {
		t.Fatal(first, err)
	}
	if err = os.WriteFile(filepath.Join(root, "changed.txt"), []byte("changed"), 0600); err != nil {
		t.Fatal(err)
	}
	current, err := Read(root)
	if err != nil || first != current {
		t.Fatal("ordinary edit changed workspace identity", err)
	}
	if err = os.Rename(root, filepath.Join(base, "original")); err != nil {
		t.Fatal(err)
	}
	if _, err = Read(root); err == nil {
		t.Fatal("missing directory has identity")
	}
	if err = os.Mkdir(root, 0700); err != nil {
		t.Fatal(err)
	}
	replaced, err := Read(root)
	if err != nil || replaced == first {
		t.Fatal("replacement directory reused identity", err)
	}
	file := filepath.Join(root, "file")
	if err = os.WriteFile(file, nil, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = Read(file); err == nil {
		t.Fatal("file accepted as workspace")
	}
}
