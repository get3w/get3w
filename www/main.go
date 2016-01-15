package main

import (
	"fmt"
	"log"
	"os"

	"github.com/Sirupsen/logrus"
	"github.com/dullgiulio/pingo"
	"github.com/get3w/get3w/cli"
	"github.com/get3w/get3w/cli/client"
	"github.com/get3w/get3w/config"
	"github.com/get3w/get3w/packages"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/pkg/term"
)

func testHelloWorld() {
	// Make a new plugin from the executable we created. Connect to it via TCP
	p := pingo.NewPlugin("tcp", "E:\\gopath\\src\\github.com\\get3w\\get3w\\packages\\hello-world\\hello-world.exe")
	// Actually start the plugin
	p.Start()
	// Remember to stop the plugin when done using it
	defer p.Stop()

	var resp string

	// Call a function from the object we created previously
	if err := p.Call("MyPlugin.SayHello", "Go developer", &resp); err != nil {
		log.Print(err)
	} else {
		log.Print(resp)
	}
}

func testHighlight() {
	p := pingo.NewPlugin("tcp", "E:\\gopath\\src\\github.com\\get3w\\get3w\\packages\\highlight\\highlight.exe")
	p.Start()
	defer p.Stop()
	options := map[string]string{
		"xx": "yy",
	}
	var resp packages.Plugin
	if err := p.Call("Highlight.Load", options, &resp); err != nil {
		log.Print(err)
	} else {
		log.Print(resp)
	}
}

func main() {
	// Set terminal emulation based on platform as required.
	stdin, stdout, stderr := term.StdStreams()

	logrus.SetOutput(stderr)

	flag.Merge(flag.CommandLine, clientFlags.FlagSet, commonFlags.FlagSet)

	flag.Usage = func() {
		fmt.Fprint(os.Stdout, "Usage: get3w [OPTIONS] COMMAND [arg...]\n       www [ --help | -v | --version ]\n\n")
		fmt.Fprint(os.Stdout, "A self-sufficient runtime for containers.\n\nOptions:\n")

		flag.CommandLine.SetOutput(os.Stdout)
		flag.PrintDefaults()

		help := "\nCommands:\n"

		for _, cmd := range get3wCommands {
			help += fmt.Sprintf("    %-10.10s%s\n", cmd.Name, cmd.Description)
		}

		help += "\nRun 'get3w COMMAND --help' for more information on a command."
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
	fmt.Printf("get3w version %s\n", config.Version)
}
