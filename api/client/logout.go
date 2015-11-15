package client

import (
	"fmt"

	"github.com/get3w/get3w-sdk-go/get3w"
	Cli "github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
)

// CmdLogout logs a user out from a Docker registry.
//
// If no server is specified, the user will be logged out from the registry's index server.
//
// Usage: docker logout [SERVER]
func (cli *DockerCli) CmdLogout(args ...string) error {
	cmd := Cli.Subcmd("logout", []string{"[SERVER]"}, Cli.DockerCommands["logout"].Description+".\nIf no server is specified is the default.", true)
	cmd.Require(flag.Max, 1)

	cmd.ParseFlags(args, true)

	serverAddress := get3w.DefaultBaseURL
	if len(cmd.Args()) > 0 {
		serverAddress = cmd.Arg(0)
	}

	if cli.configFile.AuthConfig == nil {
		fmt.Fprintf(cli.out, "Not logged in to %s\n", serverAddress)
		return nil
	}

	fmt.Fprintf(cli.out, "Remove login credentials for %s\n", serverAddress)
	cli.configFile.AuthConfig = nil
	if err := cli.configFile.Save(); err != nil {
		return fmt.Errorf("Failed to save docker config: %v", err)
	}

	return nil
}
