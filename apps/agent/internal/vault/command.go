package vault

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"
)

// Usage is the help for `remotelink vault`.
const Usage = `Remote Arc vault: sign-ins Browser Runner fills on this computer
Usage:
  remotelink vault add <name> --site <url> [--site <url>...] [--username <user>]
      Save a sign-in. The password is asked for and not shown. It is filled
      only on the given sites (https://*.example.com covers subdomains) and
      never shown to an AI.
  remotelink vault list
      Show saved sign-ins: names, sites and masked usernames.
  remotelink vault remove <name>
      Delete a saved sign-in.
Sign-ins you complete yourself in a Runner window are saved automatically
(turn off with "browserRunnerSaveLogins": false in config.json).
`

// Command runs `remotelink vault ...`. A password is read from the terminal
// without echo, or from the first line of standard input when it is not a
// terminal.
func Command(args []string, in *os.File, out io.Writer) error {
	if len(args) == 0 || args[0] == "--help" || args[0] == "-h" || args[0] == "help" {
		_, e := fmt.Fprint(out, Usage)
		return e
	}
	switch args[0] {
	case "list":
		list, e := List()
		if e != nil {
			return e
		}
		if len(list) == 0 {
			_, e = fmt.Fprintln(out, "No saved sign-ins. Add one with: remotelink vault add <name> --site <url> --username <user>")
			return e
		}
		for _, en := range list {
			fmt.Fprintf(out, "%s\t%s\t%s\t(%s, %s)\n", en.Name, strings.Join(en.Sites, ","), Mask(en.Username), en.Source, en.Updated)
		}
		_, e = fmt.Fprintln(out, "Passwords are kept with "+Protection+".")
		return e
	case "remove":
		if len(args) != 2 {
			return errors.New("usage: remotelink vault remove <name>")
		}
		ok, e := Remove(args[1])
		if e != nil {
			return e
		}
		if !ok {
			return fmt.Errorf("no saved sign-in named %q", args[1])
		}
		_, e = fmt.Fprintf(out, "Removed %s.\n", args[1])
		return e
	case "add":
		if len(args) < 2 || strings.HasPrefix(args[1], "-") {
			return errors.New("usage: remotelink vault add <name> --site <url> [--username <user>]")
		}
		name, sites, username := args[1], []string{}, ""
		for i := 2; i < len(args); i++ {
			flag, val, has := strings.Cut(args[i], "=")
			if !has && i+1 < len(args) && (flag == "--site" || flag == "--username") {
				i++
				val = args[i]
			}
			switch flag {
			case "--site":
				sites = append(sites, val)
			case "--username":
				username = val
			default:
				return fmt.Errorf("unknown option %s", args[i])
			}
		}
		if len(sites) == 0 {
			return errors.New("add at least one --site where this sign-in may be filled, for example --site https://login.example.com")
		}
		for _, s := range sites {
			if _, e := Site(s); e != nil {
				return e
			}
		}
		fmt.Fprintf(out, "Password for %s (not shown): ", name)
		pw, e := readPassword(in)
		fmt.Fprintln(out)
		if e != nil {
			return e
		}
		if e := Put(name, sites, username, pw, "cli", time.Now()); e != nil {
			return e
		}
		_, e = fmt.Fprintf(out, "Saved %s. Browser Runner fills it only on %s; the password is kept with %s.\n", name, strings.Join(sites, ", "), Protection)
		return e
	}
	return fmt.Errorf("unknown vault command %q\n%s", args[0], Usage)
}

func readPassword(in *os.File) (string, error) {
	if restore, ok := hideInput(in); ok {
		defer restore()
	}
	line, e := bufio.NewReader(in).ReadString('\n')
	if e != nil && !(errors.Is(e, io.EOF) && line != "") {
		return "", errors.New("no password entered")
	}
	pw := strings.TrimRight(line, "\r\n")
	if pw == "" {
		return "", errors.New("no password entered")
	}
	return pw, nil
}
