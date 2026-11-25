package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"syscall"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/cli"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/stopreason"
)

var version = "dev"

func main() {
	ctx, stop := stopreason.Notify(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if e := cli.Main(ctx, os.Args[1:], version, os.Stdin, os.Stdout, os.Stderr); e != nil && !errors.Is(e, context.Canceled) {
		fmt.Fprintln(os.Stderr, "Remote Arc: "+e.Error())
		os.Exit(1)
	}
}
