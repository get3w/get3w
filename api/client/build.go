package client

import (
	"fmt"

	Cli "github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/storage"
)

// CmdBuild builds a new image from the source code at a given path.
//
// If '-' is provided instead of a path or URL, Docker will build an image from either a Dockerfile or tar archive read from STDIN.
//
// Usage: get3w build [OPTIONS] PATH | URL | -
func (cli *Get3WCli) CmdBuild(args ...string) error {
	cmd := Cli.Subcmd("build", []string{"", "DIR"}, Cli.Get3WCommands["build"].Description, true)
	cmd.Require(flag.Max, 1)
	cmd.ParseFlags(args, true)

	dir := cmd.Arg(0)

	return cli.build(dir)
}

func (cli *Get3WCli) build(dir string) error {
	site, err := storage.NewLocalSite(dir)
	if err != nil {
		return err
	}

	err = site.Build()
	if err != nil {
		return err
	}

	fmt.Fprintln(cli.out, "done.")
	return nil
}
