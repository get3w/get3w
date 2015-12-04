package client

import (
	Cli "github.com/get3w/get3w/cli"
	"github.com/get3w/get3w/storage"
)

// CmdBuild builds a new image from the source code at a given path.
//
// If '-' is provided instead of a path or URL, Docker will build an image from either a Dockerfile or tar archive read from STDIN.
//
// Usage: get3w build [OPTIONS] PATH | URL | -
func (cli *Get3WCli) CmdBuild(args ...string) error {
	cmd := Cli.Subcmd("build", []string{}, Cli.Get3WCommands["build"].Description, true)
	cmd.ParseFlags(args, true)

	return build("")
}

func build(contextDir string) error {
	site, err := storage.NewLocalSite(contextDir)
	if err != nil {
		return err
	}

	site.Build()
	return nil
}
