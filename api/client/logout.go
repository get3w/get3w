package client

import (
	"fmt"

	Cli "github.com/get3w/get3w/cli"
	"github.com/get3w/get3w/cliconfig"
	flag "github.com/get3w/get3w/pkg/mflag"
)

// CmdLogout logs a user out from a Docker registry.
//
// If no server is specified, the user will be logged out from the registry's index server.
//
// Usage: docker logout [SERVER]
func (cli *Get3WCli) CmdLogout(args ...string) error {
	cmd := Cli.Subcmd("logout", []string{"[SERVER]"}, Cli.DockerCommands["logout"].Description+".\nIf no server is specified is the default.", true)
	cmd.Require(flag.Max, 1)

	cmd.ParseFlags(args, true)

	if cli.configFile.AuthConfig.AccessToken == "" {
		fmt.Fprintf(cli.out, "Not logged in\n")
		return nil
	}

	fmt.Fprintf(cli.out, "Remove login credentials\n")
	cli.configFile.AuthConfig = cliconfig.AuthConfig{}
	if err := cli.configFile.Save(); err != nil {
		return fmt.Errorf("Failed to save docker config: %v", err)
	}

	return nil
}
