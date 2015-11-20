package client

import (
	Cli "github.com/get3w/get3w/cli"
	"github.com/get3w/get3w/site"
)

const (
	tarHeaderSize = 512
)

// CmdBuild builds a new image from the source code at a given path.
//
// If '-' is provided instead of a path or URL, Docker will build an image from either a Dockerfile or tar archive read from STDIN.
//
// Usage: docker build [OPTIONS] PATH | URL | -
func (cli *DockerCli) CmdBuild(args ...string) error {
	cmd := Cli.Subcmd("build", []string{}, Cli.DockerCommands["build"].Description, true)

	cmd.ParseFlags(args, true)

	s, err := site.NewLocalSite("")
	if err != nil {
		return err
	}

	s.Build(nil)

	return nil
}
