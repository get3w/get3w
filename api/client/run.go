package client

import (
	"fmt"

	Cli "github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/pkg/watch"
	"github.com/get3w/get3w/storage"
)

// CmdRun builds a new image from the source code at a given path.
//
// If '-' is provided instead of a path or URL, Docker will build an image from either a Dockerfile or tar archive read from STDIN.
//
// Usage: get3w run [OPTIONS] PATH | URL | -
func (cli *Get3WCli) CmdRun(args ...string) error {
	cmd := Cli.Subcmd("run", []string{"", "DIR"}, Cli.Get3WCommands["run"].Description, true)
	cmd.Require(flag.Max, 1)
	cmd.ParseFlags(args, true)

	dir := cmd.Arg(0)

	return cli.run(dir)
}

func (cli *Get3WCli) run(dir string) error {
	site, err := storage.NewLocalSite(dir)
	if err != nil {
		return err
	}

	err = site.Build()
	if err != nil {
		return err
	}

	watch.Run(8000, site.GetDestinationPrefix(""))

	fmt.Fprintln(cli.out, "done.")
	return nil
}
