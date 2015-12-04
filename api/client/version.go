package client

import (
	"fmt"

	Cli "github.com/get3w/get3w/cli"
	"github.com/get3w/get3w/cliconfig"
	flag "github.com/get3w/get3w/pkg/mflag"
)

// CmdVersion show the Get3W version information.
//
// Usage: get3w version
func (cli *Get3WCli) CmdVersion(args ...string) error {
	cmd := Cli.Subcmd("version", nil, Cli.Get3WCommands["version"].Description, true)
	cmd.Require(flag.Exact, 0)
	cmd.ParseFlags(args, true)

	fmt.Fprintf(cli.out, "Get3W Version: %s\n", cliconfig.Version)
	return nil
}
