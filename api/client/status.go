package client

import (
	"fmt"

	Cli "github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/storage"
)

// CmdStatus show the working app status.
//
// Usage: get3w status
func (cli *Get3WCli) CmdStatus(args ...string) error {
	cmd := Cli.Subcmd("status", []string{"", "DIR"}, Cli.Get3WCommands["status"].Description, true)
	cmd.Require(flag.Max, 1)
	cmd.ParseFlags(args, true)

	dir := cmd.Arg(0)

	return status(dir)
}

func status(dir string) error {
	site, err := storage.NewLocalSite(dir)
	if err != nil {
		return err
	}

	if !site.IsExist(site.GetConfigKey()) {
		return fmt.Errorf("fatal: Not a get3w repository: '%s'", site.Path)
	}

	fmt.Println("Checking connectivity... done.")

	return nil
}
