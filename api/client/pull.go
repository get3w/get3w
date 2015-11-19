package client

import (
	"github.com/get3w/get3w-sdk-go/get3w"
	Cli "github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/site"
)

// CmdPull pulls an image or a repository from the registry.
//
// Usage: docker pull [OPTIONS] IMAGENAME[:TAG|@DIGEST]
func (cli *DockerCli) CmdPull(args ...string) error {
	cmd := Cli.Subcmd("pull", []string{"NAME[:TAG|@DIGEST]"}, Cli.DockerCommands["pull"].Description, true)
	cmd.Require(flag.Exact, 1)

	cmd.ParseFlags(args, true)
	appname := cmd.Arg(0)

	client := get3w.NewClient(nil)
	opts := &get3w.FileListOptions{
		Path: "...",
	}

	files, _, err := client.Files.List(appname, opts)
	if err != nil {
		s := site.NewLocalSite("")
		for _, file := range files {
			downloadURL := "http://" + appname + ".get3w.net/" + file.Path
			s.Download(file.Path, downloadURL)
		}
	}

	return err
}
