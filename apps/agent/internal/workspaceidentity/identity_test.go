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

func TestRegularFileIdentityDetectsReplacement(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "source.jsonl")
	if err := os.WriteFile(path, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	id, err := ReadFile(path)
	if err != nil || id == "" {
		t.Fatal(id, err)
	}
	if err := os.WriteFile(path, []byte("edited"), 0600); err != nil {
		t.Fatal(err)
	}
	current, err := ReadFile(path)
	if err != nil || current != id {
		t.Fatal("edit changed file identity", err)
	}
	if err := os.Rename(path, path+".old"); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadFile(path); err == nil {
		t.Fatal("missing file had identity")
	}
	if err := os.WriteFile(path, []byte("edited"), 0600); err != nil {
		t.Fatal(err)
	}
	current, err = ReadFile(path)
	if err != nil || current == id {
		t.Fatal("replacement retained file identity", err)
	}
	if _, err := ReadFile(root); err == nil {
		t.Fatal("directory accepted")
	}
	link := filepath.Join(root, "link")
	if err := os.Symlink(path, link); err != nil {
		t.Skip("symlink unavailable", err)
	}
	if _, err := ReadFile(link); err == nil {
		t.Fatal("symlink accepted")
	}
}
