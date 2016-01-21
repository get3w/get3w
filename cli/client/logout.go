package client

import (
	"fmt"

	Cli "github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
)

// CmdLogout logs a user out from a Docker registry.
//
// If no server is specified, the user will be logged out from the registry's index server.
//
// Usage: get3w logout [SERVER]
func (cli *Get3WCli) CmdLogout(args ...string) error {
	cmd := Cli.Subcmd("logout", []string{"[SERVER]"}, Cli.Get3WCommands["logout"].Description+".\nIf no server is specified is the default.", true)
	cmd.Require(flag.Max, 1)

	cmd.ParseFlags(args, true)

	return cli.logout()
}

func (cli *Get3WCli) logout() error {
	if cli.config.AuthConfig.AccessToken == "" {
		fmt.Fprintf(cli.out, "Not logged in\n")
		return nil
	}

	fmt.Fprintf(cli.out, "Remove login credentials\n")
	if err := cli.config.Logout(); err != nil {
		return fmt.Errorf("ERROR: failed to save get3w config: %v", err)
	}

	return nil
}
