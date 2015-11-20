package client

import (
	Cli "github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/storage"
)

// CmdPush pushs an app or a repository to the registry.
//
// Usage: docker pull [OPTIONS] IMAGENAME[:TAG|@DIGEST]
func (cli *DockerCli) CmdPush(args ...string) error {
	cmd := Cli.Subcmd("push", []string{"NAME[:TAG|@DIGEST]"}, Cli.DockerCommands["push"].Description, true)
	cmd.Require(flag.Exact, 1)

	cmd.ParseFlags(args, true)
	appname := cmd.Arg(0)

	_, err := storage.NewLocalSite(appname)

	return err
}
