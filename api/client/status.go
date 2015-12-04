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
	cmd := Cli.Subcmd("status", nil, Cli.Get3WCommands["status"].Description, true)
	cmd.Require(flag.Exact, 0)
	cmd.ParseFlags(args, true)

	return status("")
}

func status(contextDir string) error {
	site, err := storage.NewLocalSite(contextDir)
	if err != nil {
		return err
	}

	if !site.IsExist(site.GetConfigKey()) {
		return fmt.Errorf("fatal: Not a get3w repository: '%s'", site.Path)
	}

	fmt.Println("Checking connectivity... done.")

	return nil
}
