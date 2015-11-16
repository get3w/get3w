package client

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"os"
	"runtime"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	Cli "github.com/get3w/get3w/cli"
	"github.com/get3w/get3w/cliconfig"
	flag "github.com/get3w/get3w/pkg/mflag"
)

// CmdLogin logs in or registers a user to a Docker registry service.
//
// If no server is specified, the user will be logged into or registered to the registry's index server.
//
// Usage: docker login SERVER
func (cli *DockerCli) CmdLogin(args ...string) error {
	cmd := Cli.Subcmd("login", []string{"[SERVER]"}, Cli.DockerCommands["login"].Description+".\nIf no server is specified is the default.", true)
	cmd.Require(flag.Max, 1)

	var username, password, email string

	cmd.StringVar(&username, []string{"u", "-username"}, "", "Username")
	cmd.StringVar(&password, []string{"p", "-password"}, "", "Password")
	cmd.StringVar(&email, []string{"e", "-email"}, "", "Email")

	cmd.ParseFlags(args, true)

	log.Println("username:" + username)
	log.Println("password:" + password)
	log.Println("email:" + email)

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
	if authconfig == nil {
		authconfig = &cliconfig.AuthConfig{}
	}

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

		if email == "" {
			promptDefault("Email", authconfig.Email)
			email = readInput(cli.in, cli.out)
			if email == "" {
				email = authconfig.Email
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
		if email == "" {
			email = authconfig.Email
		}
	}
	authconfig.Username = username
	authconfig.Password = password
	authconfig.Email = email
	cli.configFile.AuthConfig = authconfig

	log.Println("username:" + cli.configFile.AuthConfig.Username)
	log.Println("password:" + cli.configFile.AuthConfig.Password)
	log.Println("email:" + cli.configFile.AuthConfig.Email)

	client := get3w.NewClient(nil)
	loginInput := &get3w.LoginInput{
		Account:  username,
		Password: password,
	}
	loginOutput, resp, err := client.Users.Login(loginInput)

	if err != nil {
		log.Println("err:" + err.Error())
		cli.configFile.AuthConfig = nil
		if err2 := cli.configFile.Save(); err2 != nil {
			fmt.Fprintf(cli.out, "WARNING: could not save config file: %v\n", err2)
		}
		return err
	}
	log.Println("loginOutput:" + loginOutput.Token)
	log.Println("resp:" + resp.String())

	if err := cli.configFile.Save(); err != nil {
		return fmt.Errorf("Error saving config file: %v", err)
	}
	fmt.Fprintf(cli.out, "WARNING: login credentials saved in %s\n", cli.configFile.Filename())

	// if response.Status != "" {
	// 	fmt.Fprintf(cli.out, "%s\n", response.Status)
	// }
	// fmt.Fprintf(cli.out, "%s\n", serverResp.statusCode)
	return nil
}
