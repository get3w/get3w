package main

import (
	"fmt"
	"os"

	"github.com/Sirupsen/logrus"
	"github.com/get3w/get3w/api/client"
	"github.com/get3w/get3w/cli"
	"github.com/get3w/get3w/cliconfig"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/pkg/term"
)

func main() {
	// Set terminal emulation based on platform as required.
	stdin, stdout, stderr := term.StdStreams()

	logrus.SetOutput(stderr)

	flag.Merge(flag.CommandLine, clientFlags.FlagSet, commonFlags.FlagSet)

	flag.Usage = func() {
		fmt.Fprint(os.Stdout, "Usage: www [OPTIONS] COMMAND [arg...]\n       www [ --help | -v | --version ]\n\n")
		fmt.Fprint(os.Stdout, "A self-sufficient runtime for containers.\n\nOptions:\n")

		flag.CommandLine.SetOutput(os.Stdout)
		flag.PrintDefaults()

		help := "\nCommands:\n"

		for _, cmd := range dockerCommands {
			help += fmt.Sprintf("    %-10.10s%s\n", cmd.Name, cmd.Description)
		}

		help += "\nRun 'docker COMMAND --help' for more information on a command."
		fmt.Fprintf(os.Stdout, "%s\n", help)
	}

	flag.Parse()

	if *flVersion {
		showVersion()
		return
	}

	if *flHelp {
		// if global flag --help is present, regardless of what other options and commands there are,
		// just print the usage.
		flag.Usage()
		return
	}

	// TODO: remove once `-d` is retired

	clientCli := client.NewGet3WCli(stdin, stdout, stderr, clientFlags)

	c := cli.New(clientCli)
	if err := c.Run(flag.Args()...); err != nil {
		if sterr, ok := err.(cli.StatusError); ok {
			if sterr.Status != "" {
				fmt.Fprintln(os.Stderr, sterr.Status)
				os.Exit(1)
			}
			os.Exit(sterr.StatusCode)
		}
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func showVersion() {
	fmt.Printf("www version %s\n", cliconfig.Version)
}
