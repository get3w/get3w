package client

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"

	"github.com/get3w/get3w"
	Cli "github.com/get3w/get3w/cli"
	"github.com/get3w/get3w/config"
	flag "github.com/get3w/get3w/pkg/mflag"
)

// CmdLogin logs in or registers a user to a Docker registry service.
//
// If no server is specified, the user will be logged into or registered to the registry's index server.
//
// Usage: get3w login SERVER
func (cli *Get3WCli) CmdLogin(args ...string) error {
	cmd := Cli.Subcmd("login", []string{"[SERVER]"}, Cli.Get3WCommands["login"].Description+".\nIf no server is specified is the default.", true)
	cmd.Require(flag.Max, 1)

	var username, password string

	cmd.StringVar(&username, []string{"u", "-username"}, "", "Username")
	cmd.StringVar(&password, []string{"p", "-password"}, "", "Password")

	cmd.ParseFlags(args, true)

	_, err := cli.login(username, password)
	return err
}

func (cli *Get3WCli) login(username, password string) (*config.AuthConfig, error) {
	// On Windows, force the use of the regular OS stdin stream. Fixes #14336/#14210
	if runtime.GOOS == "windows" {
		cli.in = os.Stdin
	}

	promptDefault := func(prompt string, configDefault string) {
		if configDefault == "" {
			fmt.Fprintf(cli.out, "%s: ", prompt)
		} else {
			fmt.Fprintf(cli.out, "%s (%s): ", prompt, configDefault)
		}
	}

	readInput := func(in io.Reader, out io.Writer) string {
		reader := bufio.NewReader(in)
		line, _, err := reader.ReadLine()
		if err != nil {
			fmt.Fprintln(out, err.Error())
			os.Exit(1)
		}
		return string(line)
	}

	authconfig := cli.configFile.AuthConfig

	if username == "" {
		promptDefault("Username", authconfig.Username)
		username = readInput(cli.in, cli.out)
		username = strings.TrimSpace(username)
		if username == "" {
			username = authconfig.Username
		}
	}

	// Assume that a different username means they may not want to use
	// the password or email from the config file, so prompt them
	if username != authconfig.Username {
		if password == "" {
			promptDefault("Password", authconfig.Password)
			password = readInput(cli.in, cli.out)
			if password == "" {
				password = authconfig.Password
			}
		}
	} else {
		// However, if they don't override the username use the
		// password or email from the cmd line if specified. IOW, allow
		// then to change/override them.  And if not specified, just
		// use what's in the config file
		if password == "" {
			password = authconfig.Password
		}
	}
	authconfig.Username = username
	authconfig.Password = password

	client := get3w.NewClient("")
	input := &get3w.UserLoginInput{
		Account:  username,
		Password: password,
	}
	output, resp, err := client.Users.Login(input)

	if resp.StatusCode == 401 {
		cli.configFile.AuthConfig = config.AuthConfig{}
		if err2 := cli.configFile.Save(); err2 != nil {
			fmt.Fprintf(cli.out, "WARNING: could not save config file: %v\n", err2)
		}
		return nil, err
	}
	if err != nil {
		return nil, err
	}

	authconfig.AccessToken = output.AccessToken
	cli.configFile.AuthConfig = authconfig
	if err := cli.configFile.Save(); err != nil {
		return nil, fmt.Errorf("ERROR: failed to save config file: %v", err)
	}
	fmt.Fprintf(cli.out, "INFO: login credentials saved in %s\n", cli.configFile.Filename())

	if resp.Status != "" {
		fmt.Fprintf(cli.out, "%s\n", resp.Status)
	}
	return &authconfig, nil
}
